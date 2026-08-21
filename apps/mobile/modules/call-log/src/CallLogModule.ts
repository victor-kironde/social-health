import { NativeModule, requireNativeModule } from 'expo';

/** One call's metadata from the Android call log. No phone number is ever read. */
export interface NativeCall {
  /** The name Android has cached for the caller (from the phone's contacts), if any. */
  name: string | null;
  /** Epoch milliseconds. */
  date: number;
  durationSec: number;
  type: 'incoming' | 'outgoing' | 'missed' | 'other';
}

declare class CallLogModule extends NativeModule<{}> {
  /** Calls after `sinceMs`, oldest first. Requires READ_CALL_LOG to have been granted. */
  getCalls(sinceMs: number): Promise<NativeCall[]>;
}

export default requireNativeModule<CallLogModule>('CallLog');
