// להדביק ב-Code.gs בתוך switch(action) של doGet — לפני default:
      case "getSites":
        if (typeof handleGetSites !== "function") {
          return jsonResponse({
            success: false,
            error: "missing_handler",
            message: "יש לוודא שהקובץ SitesApi.gs קיים בפרויקט"
          });
        }
        return jsonResponse(handleGetSites(p));
