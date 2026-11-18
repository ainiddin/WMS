package kz.keyfive.staff.data

import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Streaming

/** The FastAPI endpoints used by staff (base URL = server + "/api/"). */
interface Api {
    // ---- Auth ----
    /** 200 = tokens, 202 = Admin must enter the email code (see parseStaffLogin). */
    @POST("auth/staff/login/")
    suspend fun staffLogin(@Body body: StaffLoginRequest): Response<ResponseBody>

    @POST("auth/2fa/verify/")
    suspend fun verifyTwoFactor(@Body body: TwoFactorVerifyRequest): TokenPair

    @POST("auth/2fa/resend/")
    suspend fun resendTwoFactor(@Body body: TwoFactorResendRequest): TwoFactorChallenge

    @POST("auth/password/")
    suspend fun changePassword(@Body body: ChangePasswordRequest): TokenPair

    @POST("auth/invite/accept/")
    suspend fun acceptInvitation(@Body body: InviteAcceptRequest): User

    @GET("auth/me/")
    suspend fun me(): User

    // ---- Catalog ----
    @GET("categories/")
    suspend fun categories(@Query("include_inactive") includeInactive: Boolean = false): List<Category>

    @POST("categories/")
    suspend fun createCategory(@Body body: CategoryInput): Category

    @PATCH("categories/{id}/")
    suspend fun updateCategory(@Path("id") id: Int, @Body body: CategoryInput): Category

    @PATCH("categories/{id}/")
    suspend fun deactivateCategory(@Path("id") id: Int, @Body body: Deactivate = Deactivate()): Category

    @DELETE("categories/{id}/")
    suspend fun deleteCategory(@Path("id") id: Int): Response<Unit>

    @GET("suppliers/")
    suspend fun suppliers(@Query("include_inactive") includeInactive: Boolean = false): List<Supplier>

    @POST("suppliers/")
    suspend fun createSupplier(@Body body: SupplierInput): Supplier

    @PATCH("suppliers/{id}/")
    suspend fun updateSupplier(@Path("id") id: Int, @Body body: SupplierInput): Supplier

    @PATCH("suppliers/{id}/")
    suspend fun deactivateSupplier(@Path("id") id: Int, @Body body: Deactivate = Deactivate()): Supplier

    @DELETE("suppliers/{id}/")
    suspend fun deleteSupplier(@Path("id") id: Int): Response<Unit>

    @GET("products/")
    suspend fun products(
        @Query("include_inactive") includeInactive: Boolean = false,
        @Query("sort") sort: String = "code",
    ): List<Product>

    @GET("products/by-barcode/{code}/")
    suspend fun productByBarcode(@Path("code") code: String): Product

    @POST("products/")
    suspend fun createProduct(@Body body: ProductInput): Product

    @PATCH("products/{id}/")
    suspend fun updateProduct(@Path("id") id: Int, @Body body: ProductInput): Product

    @PATCH("products/{id}/")
    suspend fun deactivateProduct(@Path("id") id: Int, @Body body: Deactivate = Deactivate()): Product

    @DELETE("products/{id}/")
    suspend fun deleteProduct(@Path("id") id: Int): Response<Unit>

    @GET("customers/")
    suspend fun customers(@Query("search") search: String?): List<Customer>

    // ---- Movements ----
    @GET("movements/")
    suspend fun movements(
        @Query("type") type: String? = null,
        @Query("product") productId: Int? = null,
        @Query("from") from: String? = null,
        @Query("to") to: String? = null,
        @Query("limit") limit: Int = 200,
    ): List<Movement>

    @POST("movements/in/")
    suspend fun stockIn(@Body body: StockInRequest): Movement

    // ---- Orders ----
    @GET("orders/")
    suspend fun orders(@Query("status") status: String?, @Query("limit") limit: Int = 300): List<Order>

    @POST("orders/{id}/approve/")
    suspend fun approveOrder(@Path("id") id: Int): Order

    @POST("orders/{id}/reject/")
    suspend fun rejectOrder(@Path("id") id: Int, @Body body: RejectRequest): Order

    @POST("orders/{id}/ship/")
    suspend fun shipOrder(@Path("id") id: Int): Order

    @POST("orders/{id}/cancel/")
    suspend fun cancelOrder(@Path("id") id: Int): Order

    @GET("orders/workload/")
    suspend fun workload(): List<WorkerLoad>

    @POST("orders/rebalance/")
    suspend fun rebalance(): Rebalanced

    // ---- Reports ----
    @GET("dashboard/")
    suspend fun dashboard(): Dashboard

    @GET("reports/restock/")
    suspend fun restock(): List<RestockRow>

    @GET("reports/{name}/")
    suspend fun report(@Path("name") name: String): List<ReportRow>

    @Streaming
    @GET("reports/{name}/export/")
    suspend fun exportReport(@Path("name") name: String, @Query("format") format: String): Response<ResponseBody>

    // ---- Performance ----
    @GET("performance/me/")
    suspend fun myPerformance(@Query("period") period: String): MyPerformance

    @GET("performance/team/{managerId}/")
    suspend fun teamPerformance(@Path("managerId") managerId: Int, @Query("period") period: String): TeamPerformance

    @GET("performance/all/")
    suspend fun allPerformance(@Query("period") period: String): AllPerformance

    @GET("leaderboard/")
    suspend fun leaderboard(@Query("period") period: String): Leaderboard

    // ---- Admin ----
    @GET("admin/users/")
    suspend fun users(
        @Query("status") status: String? = null,
        @Query("role") role: String? = null,
        @Query("search") search: String? = null,
    ): List<AdminUser>

    @POST("admin/users/{id}/approve/")
    suspend fun approveUser(@Path("id") id: Int, @Body body: ApproveRequest): AdminUser

    @POST("admin/users/{id}/reject/")
    suspend fun rejectUser(@Path("id") id: Int): AdminUser

    @POST("admin/users/{id}/block/")
    suspend fun blockUser(@Path("id") id: Int): AdminUser

    @POST("admin/users/{id}/unblock/")
    suspend fun unblockUser(@Path("id") id: Int): AdminUser

    @POST("admin/users/{id}/clear-login-timer/")
    suspend fun clearLoginTimer(@Path("id") id: Int): AdminUser

    @PATCH("admin/users/{id}/role/")
    suspend fun changeRole(@Path("id") id: Int, @Body body: ApproveRequest): AdminUser

    @GET("admin/employees/")
    suspend fun employees(@Query("role") role: String? = null): List<Employee>

    @PATCH("admin/employees/{id}/team/")
    suspend fun changeTeam(@Path("id") employeeId: Int, @Body body: TeamChangeRequest): Employee

    @GET("admin/devices/")
    suspend fun devices(@Query("status") status: String? = null): List<StaffDevice>

    @POST("admin/devices/{id}/approve/")
    suspend fun approveDevice(@Path("id") id: Int): StaffDevice

    @POST("admin/devices/{id}/revoke/")
    suspend fun revokeDevice(@Path("id") id: Int): StaffDevice

    @GET("admin/invitations/")
    suspend fun allInvitations(@Query("status") status: String? = null): List<Invitation>

    @POST("admin/invitations/{id}/resend/")
    suspend fun adminResendInvitation(@Path("id") id: Int): Invitation

    @POST("admin/invitations/{id}/revoke/")
    suspend fun adminRevokeInvitation(@Path("id") id: Int): Invitation

    // ---- Team (Manager: only his own team) ----
    @GET("team/members/")
    suspend fun teamMembers(): List<TeamMember>

    @POST("team/members/{id}/block/")
    suspend fun blockMember(@Path("id") userId: Int): TeamMember

    @POST("team/members/{id}/unblock/")
    suspend fun unblockMember(@Path("id") userId: Int): TeamMember

    @GET("team/devices/")
    suspend fun teamDevices(@Query("status") status: String? = null): List<StaffDevice>

    @POST("team/devices/{id}/approve/")
    suspend fun approveTeamDevice(@Path("id") id: Int): StaffDevice

    @POST("team/devices/{id}/revoke/")
    suspend fun revokeTeamDevice(@Path("id") id: Int): StaffDevice

    @GET("team/invitations/")
    suspend fun myInvitations(): List<Invitation>

    @POST("team/invitations/")
    suspend fun invite(@Body body: InvitationCreate): Invitation

    @POST("team/invitations/{id}/resend/")
    suspend fun resendInvitation(@Path("id") id: Int): Invitation

    @POST("team/invitations/{id}/revoke/")
    suspend fun revokeInvitation(@Path("id") id: Int): Invitation
}
