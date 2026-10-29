import { Component, computed, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { NgFor, NgIf } from '@angular/common';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/auth.service';

interface NavItem {
  label: string;
  route: string;
  icon: string;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    NgFor,
    NgIf,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
  ],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
})
export class ShellComponent {
  auth = inject(AuthService);

  navItems = computed<NavItem[]>(() => {
    const role = this.auth.role;
    if (role === 'CUSTOMER') {
      return [
        { label: 'Catalog', route: '/catalog', icon: 'store' },
        { label: 'My Orders', route: '/my-orders', icon: 'shopping_bag' },
      ];
    }
    if (role === 'WORKER') {
      return [
        { label: 'Stock IN', route: '/stock-in', icon: 'add_box' },
        { label: 'Orders', route: '/orders', icon: 'receipt_long' },
        { label: 'Movements', route: '/movements', icon: 'swap_vert' },
      ];
    }
    // ADMIN or MANAGER
    const items: NavItem[] = [
      { label: 'Dashboard', route: '/dashboard', icon: 'dashboard' },
      { label: 'Products', route: '/products', icon: 'inventory_2' },
      { label: 'Suppliers', route: '/suppliers', icon: 'business' },
      { label: 'Customers', route: '/customers', icon: 'people' },
      { label: 'Stock IN', route: '/stock-in', icon: 'add_box' },
      { label: 'Movements', route: '/movements', icon: 'swap_vert' },
      { label: 'Orders', route: '/orders', icon: 'receipt_long' },
      { label: 'Reports', route: '/reports', icon: 'bar_chart' },
    ];
    if (role === 'ADMIN') {
      items.push({ label: 'Users', route: '/users', icon: 'manage_accounts' });
    }
    return items;
  });
}
