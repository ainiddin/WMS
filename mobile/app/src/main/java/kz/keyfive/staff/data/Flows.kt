package kz.keyfive.staff.data

import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import retrofit2.HttpException
import java.time.LocalDate
import java.time.OffsetDateTime
import kotlin.math.ceil
import kotlin.math.max

// Plain logic of the sign-in and team screens, kept free of Android so it is unit-tested on the JVM.

/** What the server answered to a staff sign in. */
sealed interface LoginStep {
    data class Done(val pair: TokenPair) : LoginStep

    /** Admin or Manager: the password was right, now the sign in code is needed. */
    data class NeedsCode(val challenge: TwoFactorChallenge) : LoginStep
}

/** 200 = tokens; 202 = an Admin or Manager who must enter the sign in code (once per phone). Anything else is a bug. */
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

/** What is wrong with a new password before it is sent, or null. The server checks the same and more. */
fun newPasswordProblem(current: String, new: String, repeat: String): String? = when {
    passwordHint(new) != null -> passwordHint(new)
    new == current -> "Must differ from the current password"
    repeat != new -> "The passwords do not match"
    else -> null
}

/**
 * The rule for a NEW password, the same as the server's and the website's: at least 8 characters, a letter, a digit
 * and a special character (@ _ - $ ... anything that is not a letter, a digit or a space). What is still missing.
 */
fun passwordProblems(password: String): List<String> = buildList {
    if (password.codePointCount(0, password.length) < 8) add("at least 8 characters")
    if (password.none { it.isLetter() }) add("a letter")
    if (password.none { it.isDigit() }) add("a digit")
    if (password.none { !it.isLetterOrDigit() && !it.isWhitespace() }) add("a special character (@ _ - \$ …)")
}

/** One line for the screen: what is missing, or null when the password follows the rule. */
fun passwordHint(password: String): String? = when {
    password.codePointCount(0, password.length) > 72 -> "At most 72 characters"
    passwordProblems(password).isNotEmpty() -> "Still needed: " + passwordProblems(password).joinToString(", ")
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

/** How often the app asks for website sign ins while it is on screen (never in the background). */
const val WEB_LOGIN_CHECK_MS = 5_000L

/** Admins and Managers sign in on the website and approve it here; Workers have no website. */
fun answersWebLogins(role: String): Boolean = role == "ADMIN" || role == "MANAGER"

/** "Chrome on Windows" from a browser's User-Agent, so the person can tell whether it is his computer. */
fun describeBrowser(userAgent: String?): String {
    val ua = userAgent.orEmpty()
    val browser = when {
        "Edg/" in ua -> "Edge"
        "OPR/" in ua || "Opera" in ua -> "Opera"
        "Firefox/" in ua -> "Firefox"
        "Chrome/" in ua -> "Chrome"
        "Safari/" in ua -> "Safari"
        else -> null
    }
    val system = when {
        "Windows" in ua -> "Windows"
        "Android" in ua -> "Android"
        "iPhone" in ua || "iPad" in ua -> "iOS"
        "Mac OS X" in ua || "Macintosh" in ua -> "macOS"
        "Linux" in ua -> "Linux"
        else -> null
    }
    return when {
        browser != null && system != null -> "$browser on $system"
        browser != null -> browser
        system != null -> "A browser on $system"
        else -> "Unknown browser"
    }
}

/** What the camera button does: hidden (no camera), ask for access first, or scan. */
enum class CameraMode { NONE, ASK, READY }

fun cameraMode(hasCamera: Boolean, permissionGranted: Boolean): CameraMode = when {
    !hasCamera -> CameraMode.NONE
    !permissionGranted -> CameraMode.ASK
    else -> CameraMode.READY
}

/** A typed barcode: digits only, at most 14 (EAN-13, EAN-8, UPC-A, GTIN-14). */
fun barcodeInput(typed: String): String = typed.filter(Char::isDigit).take(14)

/** Admin code screen: where the code went ("telegram" in the demo setup, else the corporate mailbox). */
fun codeSentHint(sentVia: String, sentTo: String): String =
    if (sentVia == "telegram") "We sent a 6-digit code to Telegram. It is asked once on this phone."
    else "We sent a 6-digit code to the corporate mailbox $sentTo. It is asked once on this phone."

fun codeFieldLabel(sentVia: String): String =
    if (sentVia == "telegram") "Code from Telegram" else "Code from the email"

/** What one barcode means while picking an order (see pickScan). */
sealed interface PickScan {
    /** The right product: this unit is counted, `picked` is the new count of that line. */
    data class Counted(val item: OrderItem, val picked: Int) : PickScan

    /** No line of this order has this barcode: the wrong product is in hand. */
    data class WrongProduct(val code: String) : PickScan

    /** The line is already complete: one unit too many. */
    data class AlreadyComplete(val item: OrderItem) : PickScan
}

/**
 * The one check for a barcode while picking, the same whether it came from the camera or was typed by hand:
 * the code is cleaned the same way (digits only, see barcodeInput), must belong to a line of this order, and that
 * line must not be complete yet. `picked` = units counted so far per order line id.
 */
fun pickScan(raw: String, items: List<OrderItem>, picked: Map<Int, Int>): PickScan {
    val code = barcodeInput(raw)
    val item = items.find { it.barcode != null && it.barcode == code } ?: return PickScan.WrongProduct(code)
    val now = picked[item.id] ?: 0
    return if (now >= item.quantity) PickScan.AlreadyComplete(item) else PickScan.Counted(item, now + 1)
}


/** The full address of an invitation link: the website is served by the same server the app talks to. */
fun invitationUrl(server: String, path: String): String = server.trimEnd('/') + "/" + path.trimStart('/')

/** Only a link that still works can be revoked. */
fun canRevokeInvitation(status: String): Boolean = status == "PENDING"

/**
 * Orders a Manager ships, as on the website: approved orders given to his team (his Workers or himself).
 * The server refuses any other order anyway.
 */
fun teamOrders(orders: List<Order>, teamEmployeeIds: Set<Int>): List<Order> =
    orders.filter { o -> o.assignedTo?.id?.let { it in teamEmployeeIds } == true }

/** Audit "details" as short "key: value" text (shown as plain text, never as markup). */
fun auditDetailsText(details: JsonObject): String =
    details.entries.joinToString(" · ") { (key, value) ->
        val text = when (value) {
            is JsonNull -> "—"
            is JsonPrimitive -> value.content
            else -> value.toString()
        }
        "${key.replace('_', ' ')}: $text"
    }

/** Audit date filter (yyyy-MM-dd): an error text, or null when the range can be asked. Empty ends mean "open". */
fun auditRangeError(from: String, to: String): String? {
    val dates = listOf(from, to).filter { it.isNotBlank() }
    if (dates.any { runCatching { LocalDate.parse(it) }.isFailure }) return "Dates as YYYY-MM-DD"
    return if (from.isNotBlank() && to.isNotBlank() && from > to) "\"From\" is after \"To\"" else null
}
