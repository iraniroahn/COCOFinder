// Station list used by the app.
// NOTE: this is sample data for demo purposes. Verify against IndianOil's official
// locator before relying on it, and send corrections via a GitHub issue or PR.
//
// Fields:
//   coco      Company Owned Company Operated outlet
//   xp100     Sells XP100 (100 octane premium petrol)
//   open24x7  Open round the clock
window.STATIONS = [
  { id: "del-cp", name: "IOCL COCO Connaught Place", address: "Connaught Place, New Delhi, Delhi 110001", city: "New Delhi", lat: 28.6304, lng: 77.2177, coco: true, xp100: true, open24x7: true, facilities: ["Petrol", "Diesel", "XP100", "XP95", "Air", "Nitrogen", "Restroom"] },
  { id: "mum-bandra", name: "IOCL COCO Bandra", address: "Bandra West, Mumbai, Maharashtra 400050", city: "Mumbai", lat: 19.0596, lng: 72.8295, coco: true, xp100: true, open24x7: true, facilities: ["Petrol", "Diesel", "XP100", "XP95", "Air", "Nitrogen", "Card Payment"] },
  { id: "blr-koramangala", name: "IOCL COCO Koramangala", address: "Koramangala, Bengaluru, Karnataka 560034", city: "Bengaluru", lat: 12.9279, lng: 77.6271, coco: true, xp100: true, open24x7: true, facilities: ["Petrol", "Diesel", "XP100", "Air", "Nitrogen", "EV Charging"] },
  { id: "chn-adyar", name: "IOCL COCO Adyar", address: "Adyar, Chennai, Tamil Nadu 600020", city: "Chennai", lat: 13.0012, lng: 80.2565, coco: true, xp100: true, open24x7: true, facilities: ["Petrol", "Diesel", "XP100", "Air", "Nitrogen"] },
  { id: "kol-saltlake", name: "IOCL COCO Salt Lake", address: "Salt Lake City, Kolkata, West Bengal 700091", city: "Kolkata", lat: 22.5868, lng: 88.4168, coco: true, xp100: false, open24x7: true, facilities: ["Petrol", "Diesel", "Air", "Nitrogen"] },
  { id: "hyd-jubilee", name: "IOCL COCO Jubilee Hills", address: "Jubilee Hills, Hyderabad, Telangana 500033", city: "Hyderabad", lat: 17.4326, lng: 78.4071, coco: true, xp100: true, open24x7: true, facilities: ["Petrol", "Diesel", "XP100", "Air", "Nitrogen"] },
  { id: "chd-sec17", name: "IOCL COCO Sector 17", address: "Sector 17, Chandigarh 160017", city: "Chandigarh", lat: 30.7333, lng: 76.7794, coco: true, xp100: false, open24x7: true, facilities: ["Petrol", "Diesel", "Air", "Nitrogen"] },
  { id: "amd-cgroad", name: "IOCL COCO C G Road", address: "C G Road, Ahmedabad, Gujarat 380009", city: "Ahmedabad", lat: 23.0225, lng: 72.5714, coco: true, xp100: false, open24x7: false, facilities: ["Petrol", "Diesel", "Air"] },
  { id: "jai-civillines", name: "IOCL COCO Civil Lines", address: "Civil Lines, Jaipur, Rajasthan 302006", city: "Jaipur", lat: 26.9124, lng: 75.7873, coco: true, xp100: false, open24x7: true, facilities: ["Petrol", "Diesel", "Air", "Nitrogen"] },
  { id: "lko-hazratganj", name: "IOCL COCO Hazratganj", address: "Hazratganj, Lucknow, Uttar Pradesh 226001", city: "Lucknow", lat: 26.8467, lng: 80.9462, coco: true, xp100: false, open24x7: false, facilities: ["Petrol", "Diesel", "Air"] },
  { id: "pun-koregaon", name: "IOCL Koregaon Park", address: "Koregaon Park, Pune, Maharashtra 411001", city: "Pune", lat: 18.5362, lng: 73.8940, coco: false, xp100: true, open24x7: true, facilities: ["Petrol", "Diesel", "XP100", "Air"] },
  { id: "ggn-golfcourse", name: "IOCL Golf Course Road", address: "Golf Course Road, Gurugram, Haryana 122002", city: "Gurugram", lat: 28.4595, lng: 77.0266, coco: false, xp100: true, open24x7: true, facilities: ["Petrol", "Diesel", "XP100", "Air", "Nitrogen"] }
];
