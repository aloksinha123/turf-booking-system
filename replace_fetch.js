const fs = require('fs');
const path = require('path');
const src = 'c:/Users/aloks/OneDrive/Desktop/turf-booking-system/turf-dashboard-ui/src';
const files = ['App.jsx', 'AdminDashboard.jsx', 'Login.jsx', 'StressDashboard.jsx', 'PaySplit.jsx', 'BookingHistory.jsx'];
for (const file of files) {
  const p = path.join(src, file);
  if (!fs.existsSync(p)) continue;
  let content = fs.readFileSync(p, 'utf-8');
  if (!content.includes('fetchApi')) {
    content = 'import { fetchApi } from \'./apiClient\';\n' + content;
    // Replace all fetch( but don't touch already replaced fetchApi
    content = content.replace(/\bfetch\(/g, 'fetchApi(');
    fs.writeFileSync(p, content);
    console.log(`Updated ${file}`);
  }
}
