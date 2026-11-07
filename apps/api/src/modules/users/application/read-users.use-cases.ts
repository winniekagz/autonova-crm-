import { Injectable } from '@nestjs/common';
import type { Paginated, RoleDto, UserDto } from '@autonova/contracts';
import { userNotFound } from '../domain/errors.js';
import { UsersRepository, type UserListFilter } from '../infrastructure/users.repository.js';

@Injectable()
export class ReadUsersUseCases {
  constructor(private readonly users: UsersRepository) {}

  async list(filter: UserListFilter): Promise<Paginated<UserDto>> {
    const { items, total } = await this.users.list(filter);
    return { items, page: filter.page, pageSize: filter.pageSize, total };
  }

  async get(id: string): Promise<UserDto> {
    const user = await this.users.findById(id);
    if (!user) throw userNotFound();
    return user;
  }

  listRoles(): Promise<RoleDto[]> {
    return this.users.listRoles();
  }
}
