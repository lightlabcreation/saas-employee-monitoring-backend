/**
 * haversine.util.js
 * 
 * Haversine formula — do GPS coordinates ke beech ki
 * actual curved-earth distance calculate karta hai (meters mein).
 * 
 * Use: attendance.service.js mein clock-in/clock-out ke waqt
 * employee office ke allowed radius ke andar hai ya nahi check karta hai.
 */

const EARTH_RADIUS_METERS = 6371000; // Earth ka radius meters mein

/**
 * Do latitude/longitude points ke beech ki distance calculate karo (meters mein)
 * 
 * @param {number} lat1 - Point 1 latitude  (employee location)
 * @param {number} lon1 - Point 1 longitude (employee location)
 * @param {number} lat2 - Point 2 latitude  (office location)
 * @param {number} lon2 - Point 2 longitude (office location)
 * @returns {number} Distance in meters
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    // Null/undefined safety check
    if (
        lat1 == null || lon1 == null ||
        lat2 == null || lon2 == null
    ) {
        return Infinity; // Safe fallback — validation will block clock-in
    }

    const toRadians = (degrees) => degrees * (Math.PI / 180);

    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return EARTH_RADIUS_METERS * c; // Distance in meters
};

module.exports = { calculateDistance };
