import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ChangeUserRolesUseCase } from './application/change-user-roles.use-case.js';
import { CreateUserUseCase } from './application/create-user.use-case.js';
import { DisableUserUseCase } from './application/disable-user.use-case.js';
import { ReadUsersUseCases } from './application/read-users.use-cases.js';
import { UpdateUserUseCase } from './application/update-user.use-case.js';
import { UsersRepository } from './infrastructure/users.repository.js';
import { RolesController, UsersController } from './presentation/users.controller.js';

@Module({
  // Users depends on Auth (session revocation through its repository); Auth never depends on Users.
  imports: [AuthModule],
  controllers: [UsersController, RolesController],
  providers: [
    UsersRepository,
    ReadUsersUseCases,
    CreateUserUseCase,
    UpdateUserUseCase,
    ChangeUserRolesUseCase,
    DisableUserUseCase,
  ],
})
export class UsersModule {}
