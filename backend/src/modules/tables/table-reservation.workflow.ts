import {
  proxyActivities,
  sleep,
  defineSignal,
  setHandler,
  condition,
} from '@temporalio/workflow';
import type { ITableActivities } from './table-activities.interface';

// Proxy gọi các Activity xử lý DB
const {
  reserveTableActivity,
  releaseTableActivity,
  checkInTableActivity,
  cleanTableActivity,
} = proxyActivities<ITableActivities>({
  startToCloseTimeout: '10 seconds',
  retry: { initialInterval: '1s', maximumAttempts: 3 },
});

// Signal để Lễ tân/User báo đã Check-in hoặc Xác nhận
export const confirmCleaningSignal = defineSignal('confirmCleaning');

// Signal nhận từ API khi Lễ tân/Khách hàng bấm Check-in
export const customerCheckedInSignal = defineSignal('customerCheckedIn');

export async function tableReservationWorkflow(dto: any) {
  let isConfirmed = false;

  // Lắng nghe Signal xác nhận (Nếu khách tới/xác nhận thì đổi flag)
  // (Signal này sẽ dừng đếm ngược nhả bàn)
  setHandler(customerCheckedInSignal, () => {
    isConfirmed = true;
  });

  // 1. Thực thi Activity Đặt bàn (Khóa bàn & lưu Outbox)
  const reservationResult = await reserveTableActivity(dto);

  if (!reservationResult?.success) {
    return reservationResult;
  }

  const tableId = reservationResult.data.id;

  // 2. TEMPORAL TIMER: Chờ đúng 2 phút bền vững (Durable Sleep)
  // Kể cả NestJS app có bị restart/crash trong 2 phút này, Temporal vẫn giữ đúng Timer!
  // await sleep('2 minutes');

  // 2. CHỜ KHÁCH CHECK-IN HOẶC HẾT 2 PHÚT (Durable Wait)
  // - Nếu nhận Signal: `isConfirmed` thành true -> Thoát ngay lập tức (không chờ hết 2 phút).
  // - Nếu KHÔNG nhận Signal sau 2 phút -> Trả về false và đi tiếp xuống dưới.
  const checkedInInTime = await condition(() => isConfirmed, '2 minutes');

  // 3. Xử lý sau thời gian chờ
  if (checkedInInTime || isConfirmed) {
    await checkInTableActivity(reservationResult.data.id);
    return {
      status: 'CONFIRMED_AND_CHECKED_IN',
      tableId,
    };
  }

  // 3. Sau 2 phút, nếu chưa Confirm -> Kích hoạt Activity Nhả bàn về AVAILABLE
  await releaseTableActivity(reservationResult.data.id);

  return { status: 'EXPIRED_AND_RELEASED', tableId };
}

export async function tableCleaningWorkflow(tableId: any) {
  let isConfirmed = false;

  // Lắng nghe Signal xác nhận (Nếu khách tới/xác nhận thì đổi flag)
  // (Signal này sẽ dừng đếm ngược nhả bàn)
  setHandler(confirmCleaningSignal, () => {
    isConfirmed = true;
  });

  await cleanTableActivity(tableId);

  // 2. CHỜ KHÁCH CHECK-IN HOẶC HẾT 2 PHÚT (Durable Wait)
  // - Nếu nhận Signal: `isConfirmed` thành true -> Thoát ngay lập tức (không chờ hết 2 phút).
  // - Nếu KHÔNG nhận Signal sau 2 phút -> Trả về false và đi tiếp xuống dưới.
  const isConfirmedInTime = await condition(() => isConfirmed, '2 minutes');

  // 3. Xử lý sau thời gian chờ
  if (isConfirmedInTime) {
    await releaseTableActivity(tableId);
    return {
      status: 'CONFIRMED_AND_CHECKED_IN',
      tableId,
    };
  }

  // 3. Sau 2 phút, nếu chưa Confirm -> Kích hoạt Activity Nhả bàn về AVAILABLE
  await releaseTableActivity(tableId);

  return { status: 'EXPIRED_AND_RELEASED', tableId };
}
