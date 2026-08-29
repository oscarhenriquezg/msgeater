import type { LoadResult, MsgEaterApi } from '@shared/types';

declare global {
  interface Window {
    msgEater: MsgEaterApi & { openDroppedFile(file: File): Promise<LoadResult> };
  }
}

export {};
