package kz.keyfive.staff.data

import retrofit2.HttpException
import java.time.OffsetDateTime
import kotlin.math.ceil
import kotlin.math.max

// Plain logic of the sign-in, invitation and team screens, kept free of Android so it is unit-tested on the JVM.

/** What the server answered to a staff sign in. */
sealed interface LoginStep {
    data class Done(val pair: TokenPair) : LoginStep

    /** Admin: the password was right, now the code from the corporate mailbox is needed. */
    data class NeedsCode(val challenge: TwoFactorChallenge) : LoginStep
}

/** 200 = tokens; 202 = an Admin who must enter the email code (once per phone). Anything else is a bug. */
fun parseStaffLogin(code: Int, body: String): LoginStep = when (code) {
    200 -> LoginStep.Done(json.decodeFromString(TokenPair.serializer(), body))
    202 -> LoginStep.NeedsCode(json.decodeFromString(TwoFactorChallenge.serializer(), body))
    else -> throw IllegalStateException("Unexpected sign-in answer ($code)")
}

/** Code fields take digits only, at most `max` of them (paste of "123 456" works). */
fun digitsOnly(input: String, max: Int = 6): String = input.filter(Char::isDigit).take(max)

/** Whole seconds left until `sentAtMillis + periodSeconds`, never negative (the "Send again in 42 s" timer). */
fun secondsLeft(sentAtMillis: Long, periodSeconds: Int, nowMillis: Long): Int =
    max(0, ceil((sentAtMillis + periodSeconds * 1000L - nowMillis) / 1000.0).toInt())

/** "12 min" / "45 s" for lock and code timers. */
fun formatWait(seconds: Int): String = if (seconds >= 60) "${(seconds + 59) / 60} min" else "$seconds s"

/** True if the ISO time is in the past (an expired Admin password). Unreadable or missing = not expired. */
fun isPast(iso: String?, nowMillis: Long): Boolean =
    iso != null && runCatching { OffsetDateTime.parse(iso).toInstant().toEpochMilli() <= nowMillis }.getOrDefault(false)

/** The server refuses everything but /me and /password until an Admin changes an expired password. */
fun isPasswordExpired(error: Throwable): Boolean =
    error is HttpException && error.code() == 403 && error.response()?.headers()?.get("X-Password-Expired") != null

/** Seconds from a 429's Retry-After header, if any. */
fun retryAfterSeconds(error: Throwable): Int? =
    (error as? HttpException)?.takeIf { it.code() == 429 }?.response()?.headers()?.get("Retry-After")?.toIntOrNull()
        ?.takeIf { it > 0 }

/** A Manager invites up to his own rank; nobody else invites in the app. */
fun invitableRoles(myRole: String): List<String> = if (myRole == "MANAGER") listOf("WORKER", "MANAGER") else emptyList()

enum class InvitationAction { RESEND, REVOKE }

/** Only an open invitation (waiting or expired) can be sent again or revoked. */
fun invitationActions(status: String): Set<InvitationAction> = when (status) {
    "PENDING", "EXPIRED" -> setOf(InvitationAction.RESEND, InvitationAction.REVOKE)
    else -> emptySet()
}

/** What is wrong with a new password before it is sent, or null. The server checks the same and more. */
fun newPasswordProblem(current: String, new: String, repeat: String): String? = when {
    new.length < 8 -> "At least 8 characters"
    new.length > 72 -> "At most 72 characters"
    new == current -> "Must differ from the current password"
    repeat != new -> "The passwords do not match"
    else -> null
}

/** Invitation accept form: what is missing, or null when it can be sent. */
fun acceptProblem(email: String, code: String, password: String, repeat: String): String? = when {
    !email.trim().contains('@') -> "Enter the email the invitation came to"
    code.length != 6 -> "Enter the 6-digit code from the email"
    password.length < 8 -> "The password needs at least 8 characters"
    password.length > 72 -> "The password can have at most 72 characters"
    repeat != password -> "The passwords do not match"
    else -> null
}

/** Exact "m:ss" (or "h:mm:ss") for a countdown in whole seconds. */
fun formatClock(seconds: Int): String {
    val s = max(0, seconds)
    val h = s / 3600
    val m = (s % 3600) / 60
    val sec = (s % 60).toString().padStart(2, '0')
    return if (h > 0) "$h:${m.toString().padStart(2, '0')}:$sec" else "$m:$sec"
}

private val waitBefore = Regex("^Wait \\d+ s before")
private val tryAgain = Regex("\\s*Try again in \\d+ min\\.?\\s*$")

/**
 * A 429 text with a live time. The server says the wait only once (Retry-After); its rounded
 * "Try again in 9 min." / "Wait 42 s ..." is replaced by the phone's own countdown.
 */
fun lockMessage(detail: String, secondsLeft: Int): String {
    val clock = formatClock(secondsLeft)
    if (waitBefore.containsMatchIn(detail)) return "A new code can be requested in $clock."
    val what = detail.replace(tryAgain, "").trim().ifEmpty { "Too many attempts." }
    return "$what Try again in $clock."
}
