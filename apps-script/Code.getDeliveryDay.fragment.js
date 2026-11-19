/**
 * להדביק בתוך switch (action) ב-Code.gs doGet — אחרי case "getNotes":
 *
 * קובץ DeliveryDayApi.gs חייב להיות באותו פרויקט Apps Script.
 * לאחר ההדבקה: Deploy → New version.
 */

      case "getDeliveryDay":
        return handleGetDeliveryDay(p);
      case "getDeliveryDates":
        return handleGetDeliveryDates(p);

/**
 * בדיקה ידנית:
 * https://script.google.com/.../exec?action=getDeliveryDay&date=2026-11-17&token=YOUR_API_TOKEN
 * https://script.google.com/.../exec?action=getDeliveryDates&token=YOUR_API_TOKEN
 *
 * Vercel env: GAS_URL + API_TOKEN (זהה ל-Script Properties API_TOKEN)
 */
