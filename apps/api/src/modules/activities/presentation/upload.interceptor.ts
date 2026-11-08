import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AttachmentsUseCases } from '../application/attachments.use-cases.js';
import { largestFileBytes } from '../domain/attachment-limits.js';

/**
 * Multer holds the upload in memory and refuses anything bigger than the largest configured category limit
 * before the request reaches a use case; the exact per-category limit and the real content are checked
 * there. One file per request, plus the `category` and `recordingNoticeGiven` fields.
 */
@Injectable()
export class AttachmentUploadInterceptor implements NestInterceptor {
  private readonly delegate: NestInterceptor;

  constructor(attachments: AttachmentsUseCases) {
    const Multer = FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: largestFileBytes(attachments.attachmentLimits),
        files: 1,
        fields: 3,
        parts: 5,
      },
    });
    this.delegate = new Multer();
  }

  intercept(context: ExecutionContext, next: CallHandler) {
    return this.delegate.intercept(context, next);
  }
}
