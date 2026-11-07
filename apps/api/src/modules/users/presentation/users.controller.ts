import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PermissionKey, SystemRoleKey } from '@autonova/enums';
import type { Paginated, RoleDto, UserDto } from '@autonova/contracts';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user.js';
import { CurrentUser, RequirePermission } from '../../auth/presentation/decorators.js';
import { ChangeUserRolesUseCase } from '../application/change-user-roles.use-case.js';
import { CreateUserUseCase } from '../application/create-user.use-case.js';
import { DisableUserUseCase } from '../application/disable-user.use-case.js';
import { ReadUsersUseCases } from '../application/read-users.use-cases.js';
import { UpdateUserUseCase } from '../application/update-user.use-case.js';
import {
  changeRolesBodySchema,
  createUserBodySchema,
  disableUserBodySchema,
  listUsersQuerySchema,
  updateUserBodySchema,
  userIdParamSchema,
  type ChangeRolesBody,
  type CreateUserBody,
  type DisableUserBody,
  type ListUsersQuery,
  type UpdateUserBody,
} from './users.schemas.js';

const requestIdOf = (request: Request) => (typeof request.id === 'string' ? request.id : undefined);
const roleKeys = Object.values(SystemRoleKey);

/**
 * Thin by design: validate, declare the required permission, call one use case. Every route
 * names its permission explicitly; the global guard refuses a route that does not.
 * (`roles` is a separate controller path below because the Director needs it to fill the role picker.)
 */
@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly read: ReadUsersUseCases,
    private readonly create: CreateUserUseCase,
    private readonly update: UpdateUserUseCase,
    private readonly changeRoles: ChangeUserRolesUseCase,
    private readonly disable: DisableUserUseCase,
  ) {}

  @Get()
  @RequirePermission(PermissionKey.UsersList)
  @ApiOperation({ summary: 'List users (paginated; filter by q, status, role)' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: '1-based page (default 1).',
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    description: 'Items per page (default 25, maximum 100).',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    type: String,
    description: 'Search query (1–100 characters).',
  })
  @ApiQuery({ name: 'status', required: false, enum: ['INVITED', 'ACTIVE', 'DISABLED'] })
  @ApiQuery({
    name: 'role',
    required: false,
    type: String,
    description: 'Filter by system role key.',
  })
  @ApiResponse({ status: 200, description: 'Paginated safe user records.' })
  list(
    @Query({ schema: listUsersQuerySchema }) query: ListUsersQuery,
  ): Promise<Paginated<UserDto>> {
    return this.read.list(query);
  }

  @Post()
  @RequirePermission(PermissionKey.UsersCreate)
  @ApiOperation({ summary: 'Invite a new internal user (created as INVITED, no password)' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['email', 'fullName', 'roles'],
      properties: {
        email: { type: 'string', format: 'email' },
        fullName: { type: 'string' },
        roles: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'string',
            enum: roleKeys,
          },
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Invited user record.' })
  invite(
    @Body({ schema: createUserBodySchema }) body: CreateUserBody,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<UserDto> {
    return this.create.execute({
      actorId: actor.id,
      requestId: requestIdOf(request),
      email: body.email,
      fullName: body.fullName,
      roles: body.roles,
    });
  }

  @Get(':id')
  @RequirePermission(PermissionKey.UsersRead)
  @ApiOperation({ summary: 'Get one user' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Safe user record.' })
  get(@Param('id', { schema: userIdParamSchema }) id: string): Promise<UserDto> {
    return this.read.get(id);
  }

  @Patch(':id')
  @RequirePermission(PermissionKey.UsersUpdate)
  @ApiOperation({ summary: 'Update a user’s display name' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['fullName'],
      properties: { fullName: { type: 'string' } },
    },
  })
  @ApiResponse({ status: 200, description: 'Updated safe user record.' })
  rename(
    @Param('id', { schema: userIdParamSchema }) id: string,
    @Body({ schema: updateUserBodySchema }) body: UpdateUserBody,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<UserDto> {
    return this.update.execute({
      actorId: actor.id,
      userId: id,
      fullName: body.fullName,
      requestId: requestIdOf(request),
    });
  }

  @Put(':id/roles')
  @RequirePermission(PermissionKey.UsersAssignRoles)
  @ApiOperation({ summary: 'Replace a user’s roles (never your own)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['roles'],
      properties: {
        roles: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'string',
            enum: roleKeys,
          },
        },
        reason: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Updated safe user record.' })
  setRoles(
    @Param('id', { schema: userIdParamSchema }) id: string,
    @Body({ schema: changeRolesBodySchema }) body: ChangeRolesBody,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<UserDto> {
    return this.changeRoles.execute({
      actorId: actor.id,
      userId: id,
      roles: body.roles,
      reason: body.reason,
      requestId: requestIdOf(request),
    });
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PermissionKey.UsersDisable)
  @ApiOperation({ summary: 'Disable a user and revoke all their sessions' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: { reason: { type: 'string' } },
    },
  })
  @ApiResponse({ status: 200, description: 'Disabled safe user record.' })
  disableUser(
    @Param('id', { schema: userIdParamSchema }) id: string,
    @Body({ schema: disableUserBodySchema }) body: DisableUserBody,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<UserDto> {
    return this.disable.execute({
      actorId: actor.id,
      userId: id,
      reason: body.reason,
      requestId: requestIdOf(request),
    });
  }
}

@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly read: ReadUsersUseCases) {}

  @Get()
  @RequirePermission(PermissionKey.RolesList)
  @ApiOperation({ summary: 'List assignable roles' })
  @ApiResponse({ status: 200, description: 'System role keys, names, and descriptions.' })
  list(): Promise<RoleDto[]> {
    return this.read.listRoles();
  }
}
