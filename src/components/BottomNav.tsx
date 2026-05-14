'use client'

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Package,
    Factory,
    ShoppingCart,
    DollarSign,
    BarChart4,
    Settings,
    Truck,
    MoreHorizontal,
    ShieldCheck,
    X
} from 'lucide-react';
import { useSystem } from '@/components/SystemProvider';

// Primary nav — always visible in bottom bar (max 4 + "More" = 5 slots)
const primaryNavAdmin = [
    { name: 'Home', href: '/', icon: LayoutDashboard },
    { name: 'Inventory', href: '/inventory', icon: Package },
    { name: 'Assembly', href: '/production', icon: Factory },
    { name: 'Purchase', href: '/purchasing', icon: ShoppingCart },
];

const primaryNavUser = [
    { name: 'Home', href: '/', icon: LayoutDashboard },
    { name: 'Inventory', href: '/inventory', icon: Package },
    { name: 'Assembly', href: '/production', icon: Factory },
    { name: 'Shipping', href: '/shipping', icon: Truck },
];

// Secondary nav — appears in "More" drawer
const secondaryNavAdmin = [
    { name: 'Sales', href: '/sales', icon: DollarSign },
    { name: 'Shipping', href: '/shipping', icon: Truck },
    { name: 'Quality', href: '/quality', icon: ShieldCheck },
    { name: 'Finance', href: '/finance', icon: DollarSign },
    { name: 'Reports', href: '/reports', icon: BarChart4 },
    { name: 'Settings', href: '/settings/users', icon: Settings },
];

const secondaryNavUser = [
    { name: 'Purchasing', href: '/purchasing', icon: ShoppingCart },
    { name: 'Quality', href: '/quality', icon: ShieldCheck },
];

export function BottomNav() {
    const pathname = usePathname();
    const { user } = useSystem();
    const [showMore, setShowMore] = useState(false);

    const isAdmin = user?.role === 'Admin';

    const primaryNav = isAdmin ? primaryNavAdmin : primaryNavUser;
    const secondaryNav = isAdmin ? secondaryNavAdmin : secondaryNavUser;

    // Check if current page is in secondary nav (to highlight "More" button)
    const isMoreActive = secondaryNav.some(item =>
        item.href !== '/' && pathname.startsWith(item.href)
    );

    return (
        <>
            <nav className="bottom-nav">
                {primaryNav.map((item) => {
                    const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`bottom-nav-item ${isActive ? 'active' : ''}`}
                            onClick={() => setShowMore(false)}
                        >
                            <Icon size={22} className={isActive ? 'nav-icon-active' : 'nav-icon'} />
                            <span className="nav-label">{item.name}</span>
                        </Link>
                    );
                })}

                {/* More button */}
                <button
                    className={`bottom-nav-item ${isMoreActive || showMore ? 'active' : ''}`}
                    onClick={() => setShowMore(prev => !prev)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                >
                    {showMore ? (
                        <X size={22} className={isMoreActive || showMore ? 'nav-icon-active' : 'nav-icon'} />
                    ) : (
                        <MoreHorizontal size={22} className={isMoreActive || showMore ? 'nav-icon-active' : 'nav-icon'} />
                    )}
                    <span className="nav-label">More</span>
                </button>
            </nav>

            {/* More drawer */}
            {showMore && (
                <>
                    <div className="more-nav-overlay" onClick={() => setShowMore(false)} />
                    <div className="more-nav-drawer">
                        <h4>More Options</h4>
                        <div className="more-nav-grid">
                            {secondaryNav.map((item) => {
                                const isActive = item.href !== '/' && pathname.startsWith(item.href);
                                const Icon = item.icon;
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={`more-nav-item ${isActive ? 'active' : ''}`}
                                        onClick={() => setShowMore(false)}
                                    >
                                        <Icon size={24} />
                                        <span>{item.name}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </>
    );
}
