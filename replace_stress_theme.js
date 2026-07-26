const fs = require('fs');
const path = require('path');
const p = 'c:/Users/aloks/OneDrive/Desktop/turf-booking-system/turf-dashboard-ui/src/StressDashboard.jsx';

let content = fs.readFileSync(p, 'utf-8');

// Container
content = content.replace('bg-[#060910]', 'bg-slate-50');

// Terminal title bar
content = content.replace('bg-[#111827]', 'bg-slate-100');
content = content.replace('border-[#1e293b]', 'border-slate-200');

// Terminal background
content = content.replace('bg-[#0a0e17]', 'bg-white');

// Hover effects
content = content.replace('hover:bg-[#111827]/50', 'hover:bg-slate-100/50');

// Grid gap color
content = content.replace('bg-[#1e293b]', 'bg-slate-200');

// Graph colors
content = content.replace('stroke: \'#0a0e17\'', 'stroke: \'#ffffff\'');

// Some text colors
content = content.replace('text-white', 'text-slate-900'); // Might need to be careful here if there are remaining text-white

fs.writeFileSync(p, content);
console.log('StressDashboard updated.');
