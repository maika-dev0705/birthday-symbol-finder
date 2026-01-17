import { getBirthData, getCategoryKeys, toDateKey } from "../../../lib/data.js";
import { isAllowedOrigin } from "../../../lib/origin-allowlist.js";

const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export async function GET(request) {
  if (!isAllowedOrigin(request)) {
    return Response.json({ error: "Origin not allowed." }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const month = Number(searchParams.get("month"));
  const day = Number(searchParams.get("day"));

  if (!month || !day || month < 1 || month > 12) {
    return Response.json({ error: "Invalid month or day." }, { status: 400 });
  }

  const maxDay = daysInMonth[month - 1];
  if (day < 1 || day > maxDay) {
    return Response.json({ error: "Invalid month or day." }, { status: 400 });
  }

  const dateKey = toDateKey(month, day);
  const data = getBirthData();
  const categories = getCategoryKeys();
  const dateData = data.dates?.[dateKey] || {};

  const items = {};
  for (const category of categories) {
    items[category] = Array.isArray(dateData[category]) ? dateData[category] : [];
  }

  return Response.json({ date: dateKey, items });
}