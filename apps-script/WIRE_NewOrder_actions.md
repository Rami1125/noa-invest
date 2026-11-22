# תיקון `unknown_action` לפורטל / הזמנה חדשה

הממשק קורא לפעולות:
- `getOrderBootstrapData`
- `injectNewOrder`
- `updateOrderCustomerNumber`

הפונקציות קיימות ב-`NewOrder.gs`, אבל **חייבות להיות מנותבות** ב-`Code.gs`.

## 1. ודאו ש-`NewOrder.gs` קיים בפרויקט Apps Script
העתיקו מ-repo: `apps-script/NewOrder.gs`

## 2. ב-`Code.gs` → `doGet` — לפני `default:`

```javascript
      case "getOrderBootstrapData":
        if (typeof handleGetOrderBootstrapData_ !== "function") {
          return jsonResponse({
            success: false,
            error: "missing_handler",
            message: "יש לוודא שקובץ NewOrder.gs קיים בפרויקט Apps Script"
          });
        }
        return handleGetOrderBootstrapData_();

      case "getSites":
        if (typeof handleGetSites === "function") return jsonResponse(handleGetSites(p));
        if (typeof handleGetSites_ === "function") return jsonResponse(handleGetSites_(p));
        return jsonResponse({
          success: false,
          error: "missing_handler",
          message: "SitesApi.gs חסר"
        });
```

## 3. ב-`Code.gs` → `doPost` — לפני `return unknown`

```javascript
    if (action === "getOrderBootstrapData") {
      if (typeof handleGetOrderBootstrapData_ !== "function") {
        return jsonResponse({ success: false, error: "missing_handler", message: "NewOrder.gs חסר" });
      }
      return handleGetOrderBootstrapData_();
    }
    if (action === "injectNewOrder") {
      if (typeof handleInjectNewOrder_ !== "function") {
        return jsonResponse({ success: false, error: "missing_handler", message: "NewOrder.gs חסר" });
      }
      return handleInjectNewOrder_(body);
    }
    if (action === "updateOrderCustomerNumber") {
      if (typeof handleUpdateOrderCustomerNumber_ !== "function") {
        return jsonResponse({ success: false, error: "missing_handler", message: "NewOrder.gs חסר" });
      }
      return handleUpdateOrderCustomerNumber_(body);
    }
```

## 4. פריסה חובה
Deploy → Manage deployments → עפרון → **New version** → Deploy  
Execute as: **Me** · Who has access: **Anyone**

## 5. בדיקה
```
GET {GAS_URL}?action=ping
GET {GAS_URL}?action=getOrderBootstrapData&token={API_TOKEN}
```
צפוי: `{"ok":true,"success":true,"data":{...}}`  
לא: `{"error":"unknown_action","action":"getOrderBootstrapData"}`

## 6. Vercel
`GAS_URL` + `API_TOKEN` ב-Preview ו-Production, זהים ל-Script Properties.
