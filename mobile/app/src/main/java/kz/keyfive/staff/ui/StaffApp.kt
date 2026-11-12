package kz.keyfive.staff.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.automirrored.filled.ReceiptLong
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.Category
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.HowToReg
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Leaderboard
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.MoveToInbox
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Store
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material.icons.filled.Warehouse
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import kotlinx.coroutines.launch
import kz.keyfive.staff.data.Session
import kz.keyfive.staff.data.User
import kz.keyfive.staff.ui.admin.ApprovalsScreen
import kz.keyfive.staff.ui.admin.DevicesScreen
import kz.keyfive.staff.ui.admin.UsersScreen
import kz.keyfive.staff.ui.manager.CategoriesScreen
import kz.keyfive.staff.ui.manager.CustomersScreen
import kz.keyfive.staff.ui.manager.DashboardScreen
import kz.keyfive.staff.ui.manager.OrdersScreen
import kz.keyfive.staff.ui.manager.ProductsScreen
import kz.keyfive.staff.ui.manager.ReportsScreen
import kz.keyfive.staff.ui.manager.RestockScreen
import kz.keyfive.staff.ui.manager.SuppliersScreen
import kz.keyfive.staff.ui.performance.AdminPerformanceScreen
import kz.keyfive.staff.ui.performance.LeaderboardScreen
import kz.keyfive.staff.ui.performance.MyPerformanceScreen
import kz.keyfive.staff.ui.performance.TeamPerformanceScreen
import kz.keyfive.staff.ui.warehouse.HistoryScreen
import kz.keyfive.staff.ui.warehouse.StockInScreen
import kz.keyfive.staff.ui.warehouse.StockScreen
import kz.keyfive.staff.ui.warehouse.ToShipScreen

private val STAFF = setOf("ADMIN", "MANAGER", "WORKER")
private val MANAGERS = setOf("ADMIN", "MANAGER")

/** A menu entry. The server checks the role on every request too; hiding entries is only for convenience. */
private class Screen(val route: String, val title: String, val icon: ImageVector, val roles: Set<String>, val group: String)

private val SCREENS = listOf(
    Screen("to-ship", "Orders to ship", Icons.Default.LocalShipping, STAFF, "Warehouse"),
    Screen("stock-in", "Stock IN", Icons.Default.MoveToInbox, STAFF, "Warehouse"),
    Screen("stock", "Stock", Icons.Default.Warehouse, STAFF, "Warehouse"),
    Screen("history", "Movement history", Icons.Default.History, STAFF, "Warehouse"),
    Screen("dashboard", "Dashboard", Icons.Default.Dashboard, MANAGERS, "Management"),
    Screen("orders", "Orders", Icons.Default.ShoppingCart, MANAGERS, "Management"),
    Screen("restock", "Restock list", Icons.Default.Warning, MANAGERS, "Management"),
    Screen("reports", "Reports", Icons.Default.Assessment, MANAGERS, "Management"),
    Screen("products", "Products", Icons.Default.Inventory2, MANAGERS, "Catalog"),
    Screen("categories", "Categories", Icons.Default.Category, MANAGERS, "Catalog"),
    Screen("suppliers", "Suppliers", Icons.Default.Store, MANAGERS, "Catalog"),
    Screen("customers", "Customers", Icons.Default.People, MANAGERS, "Catalog"),
    Screen("performance", "My performance", Icons.Default.TrendingUp, setOf("MANAGER", "WORKER"), "Performance"),
    Screen("team", "My team", Icons.Default.Groups, setOf("MANAGER"), "Performance"),
    Screen("admin-performance", "All teams", Icons.Default.TrendingUp, setOf("ADMIN"), "Performance"),
    Screen("leaderboard", "Leaderboard", Icons.Default.Leaderboard, STAFF, "Performance"),
    Screen("approvals", "Staff requests", Icons.Default.HowToReg, setOf("ADMIN"), "Admin"),
    Screen("devices", "Staff phones", Icons.Default.PhoneAndroid, setOf("ADMIN"), "Admin"),
    Screen("users", "Users", Icons.AutoMirrored.Filled.ReceiptLong, setOf("ADMIN"), "Admin"),
)

private fun home(role: String) = when (role) {
    "WORKER" -> "to-ship"
    "MANAGER" -> "dashboard"
    else -> "devices"
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StaffApp(session: Session, user: User) {
    val nav = rememberNavController()
    val drawer = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val screens = SCREENS.filter { user.role in it.roles }
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    val title = screens.firstOrNull { it.route == route }?.title ?: if (route?.startsWith("team/") == true) "Team" else ""

    ModalNavigationDrawer(
        drawerState = drawer,
        drawerContent = {
            ModalDrawerSheet {
                Column(Modifier.verticalScroll(rememberScrollState()).padding(12.dp)) {
                    Text(user.fullName, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(12.dp, 8.dp, 12.dp, 0.dp))
                    Text("${roleLabel[user.role]} · ${user.employeeCode ?: ""} · ${user.email}",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 12.dp))
                    var group = ""
                    screens.forEach { screen ->
                        if (screen.group != group) {
                            group = screen.group
                            HorizontalDivider(Modifier.padding(vertical = 8.dp))
                            Text(group, style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(start = 16.dp, bottom = 4.dp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        NavigationDrawerItem(
                            label = { Text(screen.title) },
                            icon = { Icon(screen.icon, null) },
                            selected = screen.route == route,
                            onClick = {
                                nav.go(screen.route)
                                scope.launch { drawer.close() }
                            },
                        )
                    }
                    HorizontalDivider(Modifier.padding(vertical = 8.dp))
                    NavigationDrawerItem(
                        label = { Text("Sign out") },
                        icon = { Icon(Icons.AutoMirrored.Filled.Logout, null) },
                        selected = false,
                        onClick = { session.logout() },
                    )
                }
            }
        },
    ) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text(title) },
                    navigationIcon = {
                        IconButton(onClick = { scope.launch { drawer.open() } }) { Icon(Icons.Default.Menu, "Menu") }
                    },
                )
            },
        ) { padding ->
            NavHost(nav, startDestination = home(user.role), modifier = Modifier.padding(padding)) {
                composable("to-ship") { ToShipScreen(session, user) }
                composable("stock-in") { StockInScreen(session) }
                composable("stock") { StockScreen(session) }
                composable("history") { HistoryScreen(session) }
                composable("dashboard") { DashboardScreen(session) }
                composable("orders") { OrdersScreen(session) }
                composable("restock") { RestockScreen(session) { nav.go("stock-in") } }
                composable("reports") { ReportsScreen(session) }
                composable("products") { ProductsScreen(session) }
                composable("categories") { CategoriesScreen(session) }
                composable("suppliers") { SuppliersScreen(session) }
                composable("customers") { CustomersScreen(session) }
                composable("performance") { MyPerformanceScreen(session) }
                composable("team") { TeamPerformanceScreen(session, user.employeeId ?: 0) }
                composable("team/{id}") { TeamPerformanceScreen(session, it.arguments?.getString("id")?.toIntOrNull() ?: 0) }
                composable("admin-performance") { AdminPerformanceScreen(session) { id -> nav.navigate("team/$id") } }
                composable("leaderboard") { LeaderboardScreen(session) }
                composable("approvals") { ApprovalsScreen(session) }
                composable("devices") { DevicesScreen(session) }
                composable("users") { UsersScreen(session, user) }
            }
        }
    }
}

private fun NavHostController.go(route: String) = navigate(route) {
    popUpTo(graph.startDestinationId) { saveState = true }
    launchSingleTop = true
    restoreState = true
}
