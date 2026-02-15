import React from 'react';
import Link from 'next/link';
import { BadgeDollarSign, Boxes, Factory, AlertTriangle, Truck, PackageCheck, Tag } from 'lucide-react';
import { getDashboardStats, getRecentActivity, ActivityItem } from './actions';

export const dynamic = 'force-dynamic'; // Ensure real-time data

export default async function Home() {
  const [stats, activities] = await Promise.all([
    getDashboardStats(),
    getRecentActivity() as Promise<ActivityItem[]> // Type assertion for safety
  ]);

  // Format currency
  const formattedValue = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(stats.totalValue);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1>Dashboard</h1>
          <p>Overview of inventory, production, and purchasing.</p>
        </div>
        <button className="btn btn-primary">
          Generate Report
        </button>
      </div>

      <div className="grid-cols-4" style={{ marginBottom: '2rem' }}>
        <Link href="/inventory" style={{ textDecoration: 'none' }}>
          <DashboardCard
            title="Total Inventory Value"
            value={formattedValue}
            trend="Real-time"
            icon={<BadgeDollarSign size={24} />}
            color="success"
          />
        </Link>
        <Link href="/purchasing" style={{ textDecoration: 'none' }}>
          <DashboardCard
            title="Items Low Stock"
            value={stats.lowStockCount}
            trend={stats.lowStockCount > 0 ? "Action Needed" : "Healthy"}
            icon={<AlertTriangle size={24} />}
            color={stats.lowStockCount > 0 ? "danger" : "success"}
          />
        </Link>
        <Link href="/purchasing" style={{ textDecoration: 'none' }}>
          <DashboardCard
            title="Pending Purchase Orders"
            value={stats.pendingPOs}
            trend="Active"
            icon={<PackageCheck size={24} />}
            color="primary"
          />
        </Link>
        <Link href="/inventory" style={{ textDecoration: 'none' }}>
          <DashboardCard
            title="Total Items"
            value={stats.totalItems}
            trend="Catalog"
            icon={<Boxes size={24} />}
            color="secondary"
          />
        </Link>
      </div>

      <div className="grid-cols-2" style={{ marginBottom: '2rem' }}>
        <div className="card">
          <h3>Stock Value by Warehouse</h3>
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {Object.keys(stats.warehouseValues).length === 0 ? (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No warehouse data available</div>
            ) : (
              Object.entries(stats.warehouseValues).map(([warehouse, value]) => (
                <div key={warehouse} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'var(--bg-dark)', borderRadius: 'var(--radius-md)' }}>
                  <span style={{ fontWeight: 500 }}>{warehouse}</span>
                  <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value as number)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <h3>Quick Stats</h3>
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', background: 'var(--bg-dark)', borderRadius: 'var(--radius-md)' }}>
              <span>Recent Shipments (7 days)</span>
              <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{stats.recentShipments}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', background: 'var(--bg-dark)', borderRadius: 'var(--radius-md)' }}>
              <span>Stock Accuracy</span>
              <span style={{ fontWeight: 600, color: 'var(--success)' }}>{stats.stockAccuracy}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', background: 'var(--bg-dark)', borderRadius: 'var(--radius-md)' }}>
              <span>Average Item Value</span>
              <span style={{ fontWeight: 600 }}>
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(stats.totalItems > 0 ? stats.totalValue / stats.totalItems : 0)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid-cols-2">
        <div className="card">
          <h3>Recent Activity</h3>
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {activities.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No recent activity found.</div>
            ) : (
              activities.map((activity, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '1rem', alignItems: 'center', paddingBottom: '1rem', borderBottom: idx < activities.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                  <div style={{
                    width: 40, height: 40,
                    background: getActivityColor(activity.type, true),
                    color: getActivityColor(activity.type, false),
                    display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%'
                  }}>
                    {getActivityIcon(activity.type)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 500 }}>{activity.title}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                      {activity.description} • {formatTimeAgo(activity.date)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <h3>Production Efficiency</h3>
          <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)' }}>
            Chart Placeholder
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardCard({ title, value, trend, icon, color }: any) {
  const colorVar = `var(--${color})`;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
        <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: `rgba(255,255,255,0.05)`, color: colorVar }}>
          {icon}
        </div>
        <span className={`badge badge-${color === 'warning' ? 'warning' : 'success'}`}>{trend}</span>
      </div>
      <div style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.25rem' }}>{value}</div>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{title}</div>
    </div>
  )
}

function getActivityIcon(type: string) {
  switch (type) {
    case 'Shipment': return <Truck size={18} />;
    case 'PO': return <PackageCheck size={18} />;
    case 'Item': return <Tag size={18} />;
    default: return <Factory size={18} />;
  }
}

function getActivityColor(type: string, isBackground: boolean) {
  const base = isBackground ? '0.1' : '1';
  switch (type) {
    case 'Shipment': return isBackground ? `rgba(59, 130, 246, ${base})` : '#3b82f6'; // Blue
    case 'PO': return isBackground ? `rgba(16, 185, 129, ${base})` : '#10b981'; // Green
    case 'Item': return isBackground ? `rgba(249, 115, 22, ${base})` : '#f97316'; // Orange
    default: return isBackground ? `rgba(107, 114, 128, ${base})` : '#6b7280'; // Gray
  }
}

function formatTimeAgo(date: Date | string) {
  const now = new Date();
  const past = new Date(date);
  const seconds = Math.floor((now.getTime() - past.getTime()) / 1000);

  if (seconds < 60) return 'Just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return past.toLocaleDateString();
}
