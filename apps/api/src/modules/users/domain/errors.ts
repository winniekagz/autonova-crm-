import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { VIOLATION_MESSAGES, type AdministrationViolation } from './user-administration.js';

export const userNotFound = () =>
  new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });

export const emailTaken = () =>
  new ConflictException({
    code: 'EMAIL_ALREADY_REGISTERED',
    message: 'A user with this email address already exists',
  });

export const unknownRole = (key: string) =>
  new UnprocessableEntityException({
    code: 'UNKNOWN_ROLE',
    message: `Role "${key}" does not exist`,
  });

export const ruleViolation = (violation: AdministrationViolation) =>
  new UnprocessableEntityException({ code: violation, message: VIOLATION_MESSAGES[violation] });
