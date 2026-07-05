import {cookies} from "next/headers";
import {getRequestConfig} from "next-intl/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function getDefaultLocale() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token")?.value;
  try {
    const settingsResponse = await fetch(`${API_URL}/admin/settings`, {
      headers: accessToken ? {Authorization: `Bearer ${accessToken}`} : {},
      cache: "no-store"
    });
    if (settingsResponse.ok) {
      const settings = await settingsResponse.json();
      return settings?.i18n?.default_ui_language ?? "vi";
    }
  } catch {}
  return "vi";
}

export default getRequestConfig(async () => {
  const locale = await getDefaultLocale();
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default
  };
});
