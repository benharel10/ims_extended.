# Reports & Analytics - Quick Testing Guide

## 🧪 How to Test the New Reports Module

Your dev server is running at **http://localhost:3000**

### Step-by-Step Testing:

1. **Navigate to Reports**
   - Open your browser
   - Go to: `http://localhost:3000/reports`

2. **Verify Summary Cards** (Top of page)
   You should see 4 cards displaying:
   - 💵 Total Inventory Value
   - ⚠️ Low Stock Items count
   - 🛒 Pending POs count
   - 📈 Total Revenue

3. **Test Each Tab**

   #### Tab 1: Inventory Value
   - Click "Inventory Value" tab
   - Should show table with all items
   - Columns: SKU, Name, Type, Stock, Unit Cost, Total Value
   - Click "Export to Excel" → Downloads `inventory_report_YYYY-MM-DD.xlsx`

   #### Tab 2: Low Stock ⭐ NEW!
   - Click "Low Stock" tab
   - Shows items below minimum stock
   - Look for colored badges:
     - 🔴 Red = Critical (out of stock)
     - 🟡 Yellow = High urgency
     - ⚪ Gray = Medium urgency
   - Shows deficit quantity and value

   #### Tab 3: Purchase Orders ⭐ NEW!
   - Click "Purchase Orders" tab
   - Shows all POs with status
   - Look for **progress bars** showing completion %
   - Displays ordered vs received quantities

   #### Tab 4: Sales
   - Click "Sales" tab
   - Should see financial chart at top (if you have sales data)
   - Table below shows all sales orders
   - Margin column: Green = profit, Red = loss

   #### Tab 5: Production
   - Click "Production" tab
   - Shows production run history
   - Displays quantity and value produced

   #### Tab 6: Warehouses ⭐ NEW!
   - Click "Warehouses" tab
   - Compares all warehouses side-by-side
   - Shows items, units, value per warehouse

4. **Test Export Functionality**
   - Switch to any tab
   - Click "Export to Excel" button
   - File should download with tab name + date
   - Open in Excel to verify data

---

## 🐛 Troubleshooting

### If you see errors:

**"Failed to generate report"**
- Check browser console (F12)
- Verify database is running (Prisma Studio at port 5556)

**Empty tables**
- This is normal if you don't have data in that category yet
- Try tabs with data (Inventory should always have items)

**Summary cards show 0**
- Normal if database is empty
- Add some test data to see values populate

---

## ✅ What Success Looks Like

- ✅ All 6 tabs load without errors
- ✅ Summary cards show numbers (not errors)
- ✅ Tables display data properly
- ✅ Export button downloads Excel files
- ✅ Low Stock tab shows urgency badges
- ✅ PO tab shows progress bars
- ✅ Page is responsive and looks good

---

## 📸 Screenshots to Take (Optional)

If you want to share results:
1. Summary cards at top
2. Low Stock tab with urgency badges
3. Purchase Orders tab with progress bars
4. Warehouse comparison tab

---

## 🎯 Quick Test Scenario

**5-Minute Test:**
1. Open http://localhost:3000/reports
2. Verify summary cards load
3. Click through all 6 tabs
4. Export one report to Excel
5. ✅ Done!

---

## 💡 Tips

- **Refresh the page** if you don't see new tabs
- **Check the terminal** for any error messages
- **Use Chrome/Edge** for best compatibility
- **F12 Console** helps debug any issues

---

Ready to test! Just open your browser and navigate to the reports page. 🚀
