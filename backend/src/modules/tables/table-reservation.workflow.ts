import {
  proxyActivities,
  sleep,
  defineSignal,
  setHandler,
} from '@temporalio/workflow';
import type { ITableActivities } from './table-activities.interface';

// Proxy gọi các Activity xử lý DB
const { reserveTableActivity, releaseTableActivity } =
  proxyActivities<ITableActivities>({
    startToCloseTimeout: '10 seconds',
    retry: { initialInterval: '1s', maximumAttempts: 3 },
  });

// Signal để Lễ tân/User báo đã Check-in hoặc Xác nhận
export const confirmReservationSignal = defineSignal('confirmReservation');

export async function tableReservationWorkflow(dto: any) {
  let isConfirmed = false;

  // Lắng nghe Signal xác nhận (Nếu khách tới/xác nhận thì đổi flag)
  // (Signal này sẽ dừng đếm ngược nhả bàn)
  setHandler(confirmReservationSignal, () => {
    isConfirmed = true;
  });

  // 1. Thực thi Activity Đặt bàn (Khóa bàn & lưu Outbox)
  const reservationResult = await reserveTableActivity(dto);

  if (!reservationResult?.success) {
    return reservationResult;
  }

  // 2. TEMPORAL TIMER: Chờ đúng 2 phút bền vững (Durable Sleep)
  // Kể cả NestJS app có bị restart/crash trong 2 phút này, Temporal vẫn giữ đúng Timer!
  await sleep('2 minutes');

  // 3. Sau 2 phút, nếu chưa Confirm -> Kích hoạt Activity Nhả bàn về AVAILABLE
  if (!isConfirmed) {
    await releaseTableActivity(reservationResult.data.id);
  }

  return { status: 'EXPIRED_AND_RELEASED', tableId: reservationResult.data.id };
}
