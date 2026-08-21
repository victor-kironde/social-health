package dev.kironde.calllog

import android.Manifest
import android.content.pm.PackageManager
import android.provider.CallLog
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** One call's metadata. Deliberately no number: only the name Android has cached for it. */
class CallEntry : Record {
  @Field var name: String? = null
  @Field var date: Double = 0.0
  @Field var durationSec: Int = 0
  @Field var type: String = "other"
}

class CallLogModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CallLog")

    /**
     * Calls made after `sinceMs` (epoch ms), oldest first. The projection
     * requests only cached name, date, duration and type, never NUMBER, so
     * phone numbers are not read by the app at all.
     */
    AsyncFunction("getCalls") { sinceMs: Double ->
      val context = appContext.reactContext ?: throw CodedException("NO_CONTEXT", "No Android context", null)
      if (context.checkSelfPermission(Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) {
        throw CodedException("PERMISSION_DENIED", "READ_CALL_LOG has not been granted", null)
      }
      val projection = arrayOf(
        CallLog.Calls.CACHED_NAME,
        CallLog.Calls.DATE,
        CallLog.Calls.DURATION,
        CallLog.Calls.TYPE,
      )
      val calls = mutableListOf<CallEntry>()
      context.contentResolver.query(
        CallLog.Calls.CONTENT_URI,
        projection,
        "${CallLog.Calls.DATE} > ?",
        arrayOf(sinceMs.toLong().toString()),
        "${CallLog.Calls.DATE} ASC",
      )?.use { c ->
        val iName = c.getColumnIndexOrThrow(CallLog.Calls.CACHED_NAME)
        val iDate = c.getColumnIndexOrThrow(CallLog.Calls.DATE)
        val iDuration = c.getColumnIndexOrThrow(CallLog.Calls.DURATION)
        val iType = c.getColumnIndexOrThrow(CallLog.Calls.TYPE)
        while (c.moveToNext()) {
          calls.add(CallEntry().apply {
            name = if (c.isNull(iName)) null else c.getString(iName)
            date = c.getLong(iDate).toDouble()
            durationSec = c.getInt(iDuration)
            type = when (c.getInt(iType)) {
              CallLog.Calls.INCOMING_TYPE -> "incoming"
              CallLog.Calls.OUTGOING_TYPE -> "outgoing"
              CallLog.Calls.MISSED_TYPE, CallLog.Calls.REJECTED_TYPE -> "missed"
              else -> "other"
            }
          })
        }
      }
      calls
    }
  }
}
