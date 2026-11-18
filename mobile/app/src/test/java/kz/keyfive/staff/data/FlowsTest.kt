package kz.keyfive.staff.data

import okhttp3.Headers.Companion.headersOf
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

class FlowsTest {
    private fun httpError(code: Int, vararg headers: String): HttpException {
        val raw = okhttp3.Response.Builder()
            .request(Request.Builder().url("https://example.test/api/x").build())
            .protocol(Protocol.HTTP_1_1).code(code).message("x").headers(headersOf(*headers)).build()
        return HttpException(Response.error<Any>("{\"detail\":\"x\"}".toResponseBody("application/json".toMediaType()), raw))
    }

    private val userJson = """{"id":1,"email":"a@wms.kz","full_name":"A","role":"ADMIN","status":"ACTIVE"}"""

    // ---- sign in ----
    @Test
    fun `200 gives tokens`() {
        val step = parseStaffLogin(200, """{"access_token":"a","refresh_token":"r","token_type":"bearer","user":$userJson}""")
        assertTrue(step is LoginStep.Done)
        assertEquals("a", (step as LoginStep.Done).pair.accessToken)
    }

    @Test
    fun `202 asks for the email code`() {
        val step = parseStaffLogin(202, """{"two_factor_required":true,"challenge_token":"ct","sent_to":"c***@keyfive.kz",
            "code_seconds":360,"resend_seconds":60,"expires_at":"2099-01-01T00:00:00Z"}""")
        assertTrue(step is LoginStep.NeedsCode)
        val c = (step as LoginStep.NeedsCode).challenge
        assertEquals("ct", c.challengeToken)
        assertEquals("c***@keyfive.kz", c.sentTo)
        assertEquals(60, c.resendSeconds)
    }

    @Test
    fun `202 with a token pair body is not taken as signed in`() {
        val result = runCatching { parseStaffLogin(202, """{"access_token":"a","refresh_token":"r","user":$userJson}""") }
        assertTrue(result.isFailure) // a 202 must carry a challenge, never tokens
    }

    @Test(expected = IllegalStateException::class)
    fun `other answers are not silently accepted`() {
        parseStaffLogin(204, "")
    }

    // ---- inputs and timers ----
    @Test
    fun `code fields keep only six digits`() {
        assertEquals("123456", digitsOnly("12 34-56"))
        assertEquals("123456", digitsOnly("1234567890"))
        assertEquals("", digitsOnly("abc"))
        assertEquals("12", digitsOnly("1a2", max = 6))
    }

    @Test
    fun `countdown never goes below zero and rounds up`() {
        assertEquals(60, secondsLeft(sentAtMillis = 0, periodSeconds = 60, nowMillis = 0))
        assertEquals(60, secondsLeft(0, 60, 1)) // 59.999 s left shows 60
        assertEquals(1, secondsLeft(0, 60, 59_001))
        assertEquals(0, secondsLeft(0, 60, 60_000))
        assertEquals(0, secondsLeft(0, 60, 999_999))
    }

    @Test
    fun `waits are short and readable`() {
        assertEquals("45 s", formatWait(45))
        assertEquals("1 min", formatWait(60))
        assertEquals("2 min", formatWait(61))
        assertEquals("15 min", formatWait(900))
    }

    @Test
    fun `expired password is a past time only`() {
        val now = OffsetDateTimeMillis("2026-11-18T12:00:00Z")
        assertTrue(isPast("2026-11-18T11:59:59Z", now))
        assertTrue(isPast("2026-11-18T12:00:00Z", now))
        assertFalse(isPast("2026-11-18T12:00:01Z", now))
        assertFalse(isPast("2026-11-18T17:00:01+05:00", now)) // same instant + 1 s, other zone
        assertFalse(isPast(null, now))
        assertFalse(isPast("not a date", now))
    }

    private fun OffsetDateTimeMillis(iso: String) = java.time.OffsetDateTime.parse(iso).toInstant().toEpochMilli()

    // ---- server answers ----
    @Test
    fun `only a 403 with the header means an expired password`() {
        assertTrue(isPasswordExpired(httpError(403, "X-Password-Expired", "1")))
        assertFalse(isPasswordExpired(httpError(403)))
        assertFalse(isPasswordExpired(httpError(401, "X-Password-Expired", "1")))
        assertFalse(isPasswordExpired(IllegalStateException("x")))
    }

    @Test
    fun `retry after is read only from a 429 with a positive number`() {
        assertEquals(42, retryAfterSeconds(httpError(429, "Retry-After", "42")))
        assertNull(retryAfterSeconds(httpError(429, "Retry-After", "soon")))
        assertNull(retryAfterSeconds(httpError(429, "Retry-After", "0")))
        assertNull(retryAfterSeconds(httpError(400, "Retry-After", "42")))
        assertNull(retryAfterSeconds(httpError(429)))
    }

    // ---- invitations ----
    @Test
    fun `a manager invites up to his rank and nobody else invites`() {
        assertEquals(listOf("WORKER", "MANAGER"), invitableRoles("MANAGER"))
        assertTrue(invitableRoles("WORKER").isEmpty())
        assertTrue(invitableRoles("ADMIN").isEmpty())
        assertFalse("ADMIN" in invitableRoles("MANAGER"))
    }

    @Test
    fun `only open invitations can be sent again or revoked`() {
        assertEquals(setOf(InvitationAction.RESEND, InvitationAction.REVOKE), invitationActions("PENDING"))
        assertEquals(setOf(InvitationAction.RESEND, InvitationAction.REVOKE), invitationActions("EXPIRED"))
        assertTrue(invitationActions("ACCEPTED").isEmpty())
        assertTrue(invitationActions("REVOKED").isEmpty())
        assertTrue(invitationActions("SOMETHING NEW").isEmpty())
    }

    // ---- forms ----
    @Test
    fun `new password rules`() {
        assertEquals("At least 8 characters", newPasswordProblem("old-pass-1", "short", "short"))
        assertEquals("At most 72 characters", newPasswordProblem("old-pass-1", "x".repeat(73), "x".repeat(73)))
        assertEquals("Must differ from the current password", newPasswordProblem("same-pass-1", "same-pass-1", "same-pass-1"))
        assertEquals("The passwords do not match", newPasswordProblem("old-pass-1", "new-pass-1", "new-pass-2"))
        assertNull(newPasswordProblem("old-pass-1", "new-pass-1", "new-pass-1"))
        assertNull(newPasswordProblem("same-pass-1", "SAME-PASS-1", "SAME-PASS-1")) // case matters
    }

    @Test
    fun `invitation form needs email, six digits and a matching password`() {
        assertEquals("Enter the email the invitation came to", acceptProblem(" ", "123456", "password1", "password1"))
        assertEquals("Enter the 6-digit code from the email", acceptProblem("a@wms.kz", "12345", "password1", "password1"))
        assertEquals("The password needs at least 8 characters", acceptProblem("a@wms.kz", "123456", "pass", "pass"))
        assertEquals("The passwords do not match", acceptProblem("a@wms.kz", "123456", "password1", "password2"))
        assertNull(acceptProblem(" a@wms.kz ", "123456", "password1", "password1"))
    }
}
