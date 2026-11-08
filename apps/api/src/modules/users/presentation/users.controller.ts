import { requestIdOf } from '../../../common/request-id.js';
import {
  DocAcceptInvitation,
  DocDisableUser,
  DocGetUser,
  DocInviteUser,
  DocListRoles,
  DocListUsers,
  DocRenameUser,
  DocResendInvitation,
  DocSetRoles,
} from './users.docs.js';
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
import { Throttle } from '@nestjs/throttler';
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
import { CurrentUser, Public, RequirePermission } from '../../auth/presentation/decorators.js';
import { ChangeUserRolesUseCase } from '../application/change-user-roles.use-case.js';
import { CreateUserUseCase } from '../application/create-user.use-case.js';
import { DisableUserUseCase } from '../application/disable-user.use-case.js';
import { ReadUsersUseCases } from '../application/read-users.use-cases.js';
import { UpdateUserUseCase } from '../application/update-user.use-case.js';
import { UserInvitationsService } from '../application/user-invitations.service.js';
import {
  changeRolesBodySchema,
  createUserBodySchema,
  disableUserBodySchema,
  listUsersQuerySchema,
  updateUserBodySchema,
  userIdParamSchema,
  acceptInvitationSchema,
  type ChangeRolesBody,
  type CreateUserBody,
  type DisableUserBody,
  type ListUsersQuery,
  type UpdateUserBody,
  type AcceptInvitationBody,
} from './users.schemas.js';

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
    private readonly invitations: UserInvitationsService,
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
  @DocListUsers()
  list(
    @Query({ schema: listUsersQuerySchema }) query: ListUsersQuery,
  ): Promise<Paginated<UserDto>> {
    return this.read.list(query);
  }

  @Post()
  @RequirePermission(PermissionKey.UsersCreate)
  @ApiOperation({
    summary: 'Invite a user and email a one-time account setup link',
    description:
      'Creates an INVITED account with no password and sends a 48-hour setup link. If email delivery fails, the account remains invited and an authorized administrator can resend from the user detail page.',
  })
  @ApiBody({
    examples: {
      inviteBusinessUser: {
        summary: 'Create an invited Business Development account',
        value: {
          email: 'bd.user@example.test',
          fullName: 'Example Business User',
          roles: ['business_development'],
        },
      },
    },
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
  @DocInviteUser()
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

  @Post(':id/invitation')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(PermissionKey.UsersCreate)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Resend the account setup email for an invited user',
    description: 'Revokes older invitation links and sends a fresh 48-hour setup link.',
  })
  @ApiResponse({ status: 204, description: 'A new invitation email was sent.' })
  @DocResendInvitation()
  resendInvitation(
    @Param('id', { schema: userIdParamSchema }) id: string,
    @CurrentUser() actor: AuthenticatedUser,
    @Req() request: Request,
  ): Promise<void> {
    return this.invitations.resend({
      userId: id,
      actorUserId: actor.id,
      requestId: requestIdOf(request),
    });
  }

  @Get(':id')
  @RequirePermission(PermissionKey.UsersRead)
  @ApiOperation({ summary: 'Get one user' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @DocGetUser()
  get(@Param('id', { schema: userIdParamSchema }) id: string): Promise<UserDto> {
    return this.read.get(id);
  }

  @Patch(':id')
  @RequirePermission(PermissionKey.UsersUpdate)
  @ApiOperation({ summary: 'Update a user’s display name' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiBody({
    examples: {
      rename: { summary: 'Change the display name', value: { fullName: 'Example Updated Name' } },
    },
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['fullName'],
      properties: { fullName: { type: 'string' } },
    },
  })
  @DocRenameUser()
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
    examples: {
      replaceRoles: {
        summary: 'Replace roles on another user (not your own account)',
        value: { roles: ['business_development'], reason: 'Role aligned to current duties' },
      },
    },
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
  @DocSetRoles()
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
    examples: {
      disable: {
        summary: 'Disable a disposable account and revoke its sessions',
        value: { reason: 'Local API documentation smoke test' },
      },
    },
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: { reason: { type: 'string' } },
    },
  })
  @DocDisableUser()
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
  @DocListRoles()
  list(): Promise<RoleDto[]> {
    return this.read.listRoles();
  }
}

@ApiTags('auth')
@Controller('auth/invitations')
export class InvitationAcceptanceController {
  constructor(private readonly invitations: UserInvitationsService) {}

  @Public()
  @Post('accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({
    summary: 'Set a password and activate an invited account',
    description: 'Invitation links expire after 48 hours and can be used once.',
  })
  @ApiBody({
    examples: {
      accept: {
        summary: 'Replace the token with the one from your invitation email',
        value: {
          token: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          password: 'use-a-unique-12-char-password',
        },
      },
    },
    schema: {
      type: 'object',
      required: ['token', 'password'],
      additionalProperties: false,
      properties: {
        token: { type: 'string', description: 'Single-use token from the invitation link.' },
        password: { type: 'string', minLength: 12, maxLength: 128 },
      },
    },
  })
  @ApiResponse({ status: 204, description: 'Account activated; the user can now sign in.' })
  @DocAcceptInvitation()
  accept(
    @Body({ schema: acceptInvitationSchema }) body: AcceptInvitationBody,
    @Req() request: Request,
  ) {
    return this.invitations.accept({
      token: body.token,
      password: body.password,
      requestId: requestIdOf(request),
    });
  }
}
