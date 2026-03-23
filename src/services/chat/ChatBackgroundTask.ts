import { NativeModules } from 'react-native';

interface ChatBackgroundTaskModule {
  begin(taskName?: string): Promise<number | null>;
  end(taskId: number): void;
}

const nativeModule = NativeModules.ChatBackgroundTask as ChatBackgroundTaskModule | undefined;

export class ChatBackgroundTask {
  static async begin(taskName: string = 'ChatKnot Streaming'): Promise<number | null> {
    if (!nativeModule?.begin) {
      return null;
    }

    try {
      return await nativeModule.begin(taskName);
    } catch {
      return null;
    }
  }

  static end(taskId: number | null | undefined) {
    if (taskId == null || !nativeModule?.end) {
      return;
    }

    try {
      nativeModule.end(taskId);
    } catch {
      // Ignore cleanup errors; the OS may have already expired the task.
    }
  }
}
