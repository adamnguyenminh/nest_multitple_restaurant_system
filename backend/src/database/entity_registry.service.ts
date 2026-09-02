import { Injectable } from '@nestjs/common';
import { EntitySchema } from 'typeorm';

// Định nghĩa đúng Type mà TypeORM chấp nhận cho thuộc tính entities
export type EntityClassOrSchema = Function | EntitySchema<any> | string;

@Injectable()
export class EntityRegistry {
  private static entities: EntityClassOrSchema[] = [];

  public static register(entityList: EntityClassOrSchema[]) {
    this.entities.push(...entityList);
  }

  public static getEntities(): EntityClassOrSchema[] {
    return this.entities;
  }
}
