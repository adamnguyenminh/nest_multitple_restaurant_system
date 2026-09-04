import { Repository, DataSource } from 'typeorm';
import { Table } from './entities/table.entity';

export class TableRepository extends Repository<Table> {
  constructor(dataSource: DataSource) {
    super(Table, dataSource.createEntityManager());
  }

  // Viết custom queries cho Table tại đây
  async findAvailableTables(): Promise<Table[]> {
    return this.createQueryBuilder('table')
      .where('table.status = :status', { status: 'AVAILABLE' })
      .getMany();
  }
}
