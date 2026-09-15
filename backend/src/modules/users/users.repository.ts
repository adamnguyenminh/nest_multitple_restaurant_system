import { Repository, DataSource } from 'typeorm';
import { User } from './entities/user.entity';

export class UserRepository extends Repository<User> {
  constructor(dataSource: DataSource) {
    super(User, dataSource.createEntityManager());
  }
}
