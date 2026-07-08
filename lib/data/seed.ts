export const months = ['2025-01','2025-02','2025-03','2025-04','2025-05']

export const services = [
  { id: 's1', name: 'Signature Balayage', category: 'Hair', price: 4500, monthlyBookings: [12,14,13,15,16] },
  { id: 's2', name: 'Precision Cut & Style', category: 'Hair', price: 1200, monthlyBookings: [110,125,132,140,148] },
  { id: 's3', name: 'Organic Color Melt', category: 'Hair', price: 3200, monthlyBookings: [8,9,10,11,13] },
  { id: 's4', name: 'Gel Manicure', category: 'Nails', price: 650, monthlyBookings: [180,200,210,220,241] },
  { id: 's5', name: 'Spa Pedicure', category: 'Nails', price: 900, monthlyBookings: [120,130,140,155,179] },
  { id: 's6', name: 'HydraFacial', category: 'Skin', price: 3500, monthlyBookings: [30,32,36,40,42] },
  { id: 's7', name: 'Relaxing Massage 60m', category: 'Wellness', price: 1500, monthlyBookings: [45,48,50,52,55] },
  { id: 's8', name: 'Blowout & Finish', category: 'Hair', price: 800, monthlyBookings: [60,62,65,70,72] },
]

export const inventory = [
  { id: 'i1', name: "Kérastase Volumifique 500ml", supplier: 'Kerastase PH', stock: 6, rp: 10, unitCost: 1200 },
  { id: 'i2', name: 'Wella Koleston 7/0 100g', supplier: 'Wella', stock: 14, rp: 20, unitCost: 180 },
  { id: 'i3', name: '20 Vol Developer 1L', supplier: 'Local Chem', stock: 9, rp: 12, unitCost: 220 },
  { id: 'i4', name: 'Gel Polish Red', supplier: 'NailCo', stock: 40, rp: 30, unitCost: 60 },
  { id: 'i5', name: 'Disposable Towels (pack)', supplier: 'SupplyHouse', stock: 24, rp: 20, unitCost: 80 },
  { id: 'i6', name: 'HydraFacial Serum', supplier: 'SkinLabs', stock: 4, rp: 6, unitCost: 650 },
  { id: 'i7', name: 'Massage Oil 500ml', supplier: 'Aroma', stock: 18, rp: 15, unitCost: 300 },
  { id: 'i8', name: 'Salon Gloves (box)', supplier: 'SupplyHouse', stock: 6, rp: 8, unitCost: 200 },
]

export const expenses = [
  { category: 'Rent', monthly: [50000,50000,50000,50000,50000] },
  { category: 'Salaries', monthly: [120000,122000,121500,123000,124500] },
  { category: 'Utilities', monthly: [8000,8200,7800,7900,8000] },
  { category: 'Supplies', monthly: [15000,16000,15500,15800,16200] },
]
