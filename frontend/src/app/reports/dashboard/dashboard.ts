import { Component, inject, OnInit } from '@angular/core';
import { NgIf, NgFor, DecimalPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ChartData, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { ApiService } from '../../core/api.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    NgIf,
    NgFor,
    DecimalPipe,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    BaseChartDirective,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardComponent implements OnInit {
  private api = inject(ApiService);

  data: any = null;
  loading = true;

  stockChartData: ChartData<'bar'> = {
    labels: [],
    datasets: [{
      data: [],
      label: 'Stock IN',
      backgroundColor: '#3f51b5',
    }, {
      data: [],
      label: 'Stock OUT',
      backgroundColor: '#f44336',
    }]
  };

  chartOptions: ChartOptions<'bar'> = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
    },
    scales: {
      y: { beginAtZero: true }
    }
  };

  ngOnInit(): void {
    this.api.getDashboard().subscribe({
      next: (res) => {
        this.data = res;
        this.buildChart(res);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  private buildChart(res: any): void {
    const monthly = res?.monthly_movements ?? [];
    this.stockChartData = {
      labels: monthly.map((m: any) => m.month),
      datasets: [
        {
          data: monthly.map((m: any) => m.in_qty ?? 0),
          label: 'Stock IN',
          backgroundColor: '#3f51b5',
        },
        {
          data: monthly.map((m: any) => m.out_qty ?? 0),
          label: 'Stock OUT',
          backgroundColor: '#f44336',
        }
      ]
    };
  }
}
