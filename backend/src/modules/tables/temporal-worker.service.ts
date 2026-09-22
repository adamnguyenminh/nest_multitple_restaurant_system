// temporal-worker.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Worker } from '@temporalio/worker';
import { TableActivities } from './table.activities';

@Injectable()
export class TemporalWorkerService implements OnModuleInit {
  constructor(private readonly tableActivities: TableActivities) {}

  async onModuleInit() {
    const worker = await Worker.create({
      // Đường dẫn trỏ tới file chứa tableReservationWorkflow
      workflowsPath: require.resolve('./table-reservation.workflow'),
      taskQueue: 'table-reservation-queue', // Phải khớp với Queue ở Controller
      activities: {
        reserveTableActivity: this.tableActivities.reserveTableActivity.bind(
          this.tableActivities,
        ),
        releaseTableActivity: this.tableActivities.releaseTableActivity.bind(
          this.tableActivities,
        ),
        checkInTableActivity: this.tableActivities.checkInTableActivity.bind(
          this.tableActivities,
        ),
        cleanTableActivity: this.tableActivities.cleanTableActivity.bind(
          this.tableActivities,
        ),
      },
    });

    // Bắt đầu Worker chạy ngầm
    worker.run().catch((err) => {
      console.error('Temporal Worker failed to start', err);
    });

    console.log(
      'Temporal Worker is listening on task queue: table-reservation-queue',
    );
  }
}
