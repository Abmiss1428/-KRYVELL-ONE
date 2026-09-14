export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const pat = process.env.ACSTUDIO_AIRTABLE_PAT;
  const baseId = process.env.ACSTUDIO_AIRTABLE_BASE_ID;
  const patPresent = Boolean(pat);
  const basePresent = Boolean(baseId);

  if (!patPresent || !basePresent) {
    return res.status(200).json({
      ok: false,
      pat_present: patPresent,
      base_id_present: basePresent,
      airtable_connected: false,
      error: 'missing_configuration'
    });
  }

  try {
    const response = await fetch(`https://api.airtable.com/v0/meta/bases/${encodeURIComponent(baseId)}/tables`, {
      headers: {
        Authorization: `Bearer ${pat}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      return res.status(200).json({
        ok: false,
        pat_present: true,
        base_id_present: true,
        airtable_connected: false,
        airtable_status: response.status,
        error: response.status === 401 ? 'invalid_pat' : response.status === 403 ? 'base_access_denied' : response.status === 404 ? 'base_not_found' : 'airtable_request_failed'
      });
    }

    const data = await response.json();
    const tables = Array.isArray(data.tables)
      ? data.tables.map((table) => ({ id: table.id, name: table.name }))
      : [];

    return res.status(200).json({
      ok: true,
      pat_present: true,
      base_id_present: true,
      airtable_connected: true,
      table_count: tables.length,
      tables
    });
  } catch (error) {
    return res.status(200).json({
      ok: false,
      pat_present: true,
      base_id_present: true,
      airtable_connected: false,
      error: 'network_error'
    });
  }
}
