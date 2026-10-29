import { Component, Inject } from '@angular/core';
import { NgFor, NgIf, CurrencyPipe, DatePipe } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatDividerModule } from '@angular/material/divider';

@Component({
  selector: 'app-order-detail-dialog',
  standalone: true,
  imports: [NgFor, NgIf, CurrencyPipe, DatePipe, MatDialogModule, MatButtonModule, MatTableModule, MatDividerModule],
  template: `
    <h2 mat-dialog-title>Order {{ data.code }}</h2>
    <mat-dialog-content>
      <p><strong>Customer:</strong> {{ data.customer_name }}</p>
      <p><strong>Status:</strong> <span [class]="'status-badge status-' + data.status">{{ data.status }}</span></p>
      <p><strong>Date:</strong> {{ data.created_at | date:'medium' }}</p>
      <p *ngIf="data.comment"><strong>Comment:</strong> {{ data.comment }}</p>
      <mat-divider style="margin: 12px 0"></mat-divider>
      <h4>Items</h4>
      <table mat-table [dataSource]="data.items || []" class="items-table">
        <ng-container matColumnDef="product">
          <th mat-header-cell *matHeaderCellDef>Product</th>
          <td mat-cell *matCellDef="let i">{{ i.product_name }}</td>
        </ng-container>
        <ng-container matColumnDef="qty">
          <th mat-header-cell *matHeaderCellDef>Qty</th>
          <td mat-cell *matCellDef="let i">{{ i.quantity }}</td>
        </ng-container>
        <ng-container matColumnDef="price">
          <th mat-header-cell *matHeaderCellDef>Unit Price</th>
          <td mat-cell *matCellDef="let i">{{ i.unit_price | currency:'KZT':'symbol':'1.2-2' }}</td>
        </ng-container>
        <ng-container matColumnDef="total">
          <th mat-header-cell *matHeaderCellDef>Total</th>
          <td mat-cell *matCellDef="let i">{{ i.total_price | currency:'KZT':'symbol':'1.2-2' }}</td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="['product','qty','price','total']"></tr>
        <tr mat-row *matRowDef="let row; columns: ['product','qty','price','total'];"></tr>
      </table>
      <mat-divider style="margin: 12px 0"></mat-divider>
      <p class="total-row"><strong>Total: {{ data.total_amount | currency:'KZT':'symbol':'1.2-2' }}</strong></p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Close</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .items-table { width: 100%; }
    .status-badge { padding: 3px 8px; border-radius: 10px; font-size: 12px; font-weight: 600; }
    .status-PENDING { background: #fff3e0; color: #e65100; }
    .status-APPROVED { background: #e3f2fd; color: #1565c0; }
    .status-SHIPPED { background: #e8f5e9; color: #1b5e20; }
    .status-REJECTED, .status-CANCELLED { background: #ffebee; color: #b71c1c; }
    .total-row { text-align: right; font-size: 1.1em; }
  `],
})
export class OrderDetailDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: any) {}
}
