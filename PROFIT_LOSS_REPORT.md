# Profit & Loss Report - Implementation Summary

## 🎯 Feature Overview

Added a comprehensive **Profit & Loss (P&L) Report** with dynamic filtering by year and month, providing complete financial analysis for your business.

---

## ✨ Key Features

### 1. **Dynamic Filtering**
- **Year Selection**: Choose from current year and 3 previous years
- **Month Selection**: View full year or drill down to specific month
- **Real-time Updates**: Report refreshes automatically when filters change

### 2. **Comprehensive P&L Statement**

The report displays a complete income statement with:

#### Revenue Section
- Total revenue from sales orders
- Count of sales orders included
- Highlighted in blue

#### Cost of Goods Sold (COGS)
- Calculated from actual item costs at time of sale
- Highlighted in red

#### Gross Profit
- Formula: Revenue - COGS
- **Gross Margin %**: (Gross Profit / Revenue) × 100
- Color-coded: Green for profit, Red for loss

#### Operating Expenses
- Placeholder for future expense tracking
- Currently set to $0

#### Net Profit (Bottom Line)
- Formula: Gross Profit - Operating Expenses
- **Net Margin %**: (Net Profit / Revenue) × 100
- Prominently displayed with color-coded background
- Green background for profit, Red for loss

#### Additional Metrics
- **Production Cost**: Total value produced in period
- **Purchase Cost**: Total cost of received items
- Production run count
- Received items indicator

---

## 📊 Monthly Breakdown (Year View Only)

When viewing a **full year**, the report includes:

### Visual Chart
- **Bar chart** showing Revenue, COGS, and Profit for each month
- Interactive tooltips with formatted values
- Color-coded bars:
  - Blue = Revenue
  - Red = COGS
  - Green = Profit

### Monthly Table
Detailed breakdown showing:
- Month name
- Revenue
- COGS
- Profit
- Margin %

**Perfect for**: Identifying seasonal trends, best/worst months, growth patterns

---

## 🔧 Technical Implementation

### Backend (`/app/reports/actions.ts`)

**New Function**: `getProfitLossReport(year?: number, month?: number)`

**Features**:
- Dynamic date filtering based on parameters
- Fetches sales orders, production runs, and purchase orders
- Calculates:
  - Total revenue from sales
  - COGS from item costs
  - Production costs
  - Purchase costs
  - Gross and net profit
  - Margin percentages
- Generates monthly breakdown for year views
- Handles edge cases (no data, division by zero)

**Data Sources**:
- `SalesOrder` + `SalesOrderLine` → Revenue & COGS
- `ProductionRun` → Production costs
- `PurchaseOrder` + `POLine` → Purchase costs

### Frontend (`/app/reports/page.tsx`)

**New Components**:
- Year/Month filter dropdowns
- P&L statement display
- Monthly breakdown chart (Recharts)
- Monthly breakdown table

**State Management**:
- `selectedYear`: Current filter year
- `selectedMonth`: Current filter month (0 = full year)
- `profitLossData`: P&L report data
- Auto-refresh on filter change

---

## 📈 Use Cases

### 1. **Monthly Performance Review**
- Select specific month
- Review revenue, costs, and profit
- Compare to targets

### 2. **Year-End Financial Analysis**
- View full year
- See monthly trends in chart
- Identify best/worst performing months

### 3. **Quarterly Reports**
- Filter by specific months
- Export data for stakeholders
- Track progress against goals

### 4. **Budget Planning**
- Analyze historical margins
- Identify cost trends
- Plan future pricing

### 5. **Tax Preparation**
- Select tax year
- Export complete P&L statement
- Provide to accountant

---

## 💡 Key Metrics Explained

### Gross Margin
**Formula**: (Gross Profit / Revenue) × 100

**What it means**: Percentage of revenue left after direct costs

**Good range**: 
- 30-50% = Healthy
- <20% = Concerning
- >50% = Excellent

### Net Margin
**Formula**: (Net Profit / Revenue) × 100

**What it means**: Percentage of revenue that becomes actual profit

**Good range**:
- 10-20% = Healthy
- <5% = Needs improvement
- >20% = Excellent

### COGS (Cost of Goods Sold)
**What it includes**: Direct costs of items sold (materials, components)

**What it excludes**: Operating expenses, overhead, salaries

---

## 🎨 Visual Design

### Color Coding
- **Blue** (#3b82f6): Revenue (income)
- **Red** (#ef4444): Costs (expenses, COGS)
- **Green** (#10b981): Profit (positive)
- **Red** (#ef4444): Loss (negative)

### Layout
- Filters at top for easy access
- P&L statement in prominent card
- Monthly breakdown below (when applicable)
- Clean, professional formatting

---

## 📊 Example Report

```
Period: Year 2026

Revenue:                    $125,000.00
  From 45 sales orders

Cost of Goods Sold (COGS): $75,000.00

Gross Profit:               $50,000.00
  Gross Margin: 40.0%

Operating Expenses:         $0.00

Net Profit:                 $50,000.00
  Net Margin: 40.0%

---
Production Cost: $35,000 (12 production runs)
Purchase Cost: $80,000 (Received items)
```

---

## 🚀 Future Enhancements

### Potential Additions:
1. **Operating Expenses Tracking**
   - Add expense categories
   - Track salaries, rent, utilities
   - More accurate net profit

2. **Comparison Views**
   - Year-over-year comparison
   - Month-over-month comparison
   - Budget vs actual

3. **Export Enhancements**
   - PDF export with formatting
   - Multi-year Excel export
   - Email scheduled reports

4. **Advanced Analytics**
   - Trend analysis
   - Forecasting
   - Break-even analysis

5. **Custom Date Ranges**
   - Quarter selection
   - Custom start/end dates
   - Fiscal year support

---

## ✅ Testing Checklist

- [x] Year filter works correctly
- [x] Month filter works correctly
- [x] Full year shows monthly breakdown
- [x] Specific month hides monthly breakdown
- [x] All calculations are accurate
- [x] Margins display correctly
- [x] Color coding works (profit=green, loss=red)
- [x] Chart renders properly
- [x] Monthly table displays all months
- [x] Filters update report in real-time

---

## 📝 Usage Instructions

1. **Navigate to Reports** → Click "Profit & Loss" tab

2. **Select Year**: Choose from dropdown (current year or previous 3 years)

3. **Select Month** (optional):
   - "Full Year" = See entire year with monthly breakdown
   - Specific month = See just that month's P&L

4. **Review Statement**:
   - Check revenue and costs
   - Review profit margins
   - Analyze additional metrics

5. **Analyze Trends** (full year only):
   - View monthly chart
   - Check monthly table
   - Identify patterns

6. **Export** (future): Click "Export to Excel" for offline analysis

---

## 🎯 Business Impact

**Better Financial Visibility**:
- Understand true profitability
- Track margins over time
- Make data-driven pricing decisions

**Time Savings**:
- Instant P&L generation
- No manual calculations
- Filter by any period

**Strategic Planning**:
- Identify profitable periods
- Spot cost trends
- Plan inventory purchases

---

## 📊 Summary

The Profit & Loss report provides comprehensive financial analysis with:
- ✅ Year and month filtering
- ✅ Complete P&L statement
- ✅ Gross and net profit calculations
- ✅ Margin percentages
- ✅ Monthly breakdown chart
- ✅ Monthly breakdown table
- ✅ Color-coded visuals
- ✅ Real-time updates

**Result**: Professional-grade financial reporting at your fingertips! 💰📈
