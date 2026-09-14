const MODULES = {
  redline: {
    title: 'REDLINE NEXUS — NEXUS CONTROL',
    sections: [
      {
        name: 'Canon REDLINE NEXUS',
        tableId: 'tblflNx07pRpu22xA',
        pageSize: 10,
        sort: { field: 'fldP9UHNTf1L2Qg0a', direction: 'desc' },
        fields: {
          fldr69vNB7iMIrxsk: 'Canon ID',
          fldbb56q34BJE60ui: 'Nom',
          fldnZKVSZ4mdag6zk: 'Type',
          fldf4PwW4NugdKSoy: 'Définition officielle',
          fldFF4LxbRz7R4gf6: 'Statut',
          fld8tDXVuqPSOTVws: 'Version',
          fldP9UHNTf1L2Qg0a: 'Date de validation',
          fldtn4uLw9PDx1Xcx: 'LOCK'
        }
      },
      {
        name: 'Personnages canon',
        tableId: 'tbl7JCyIRFLVlPg7W',
        pageSize: 10,
        fields: {
          fldhmlTBsu0zmQnhG: 'Character ID',
          fldixAMqZJKiBTM3D: 'Nom officiel',
          fldQbdMAUfZTgjdPH: 'Rôle',
          fldyeROPJvBIgUBuk: 'Apparence',
          fldFQXm1F71wiY9t9: 'Relations',
          fldutiaHUVNyCJSK0: 'Monde',
          fldrOB4H8ZzqGu2VN: 'Statut canon',
          fldvZO6y2GPrDavmP: 'Version',
          fldetTtMojB6ZkoyW: 'Interdictions'
        }
      }
    ]
  },
  forge: {
    title: 'FORGE DE PERSONNAGES',
    sections: [
      {
        name: 'Fiches personnages',
        tableId: 'tbl7JCyIRFLVlPg7W',
        pageSize: 12,
        fields: {
          fldhmlTBsu0zmQnhG: 'Character ID',
          fldixAMqZJKiBTM3D: 'Nom officiel',
          fldQbdMAUfZTgjdPH: 'Rôle',
          fldyeROPJvBIgUBuk: 'Apparence',
          fldFQXm1F71wiY9t9: 'Relations',
          fldrOB4H8ZzqGu2VN: 'Statut canon',
          fldvZO6y2GPrDavmP: 'Version',
          fldetTtMojB6ZkoyW: 'Interdictions'
        }
      },
      {
        name: 'Character Forge — registre',
        tableId: 'tblT7zLhkEldVDKkE',
        pageSize: 12,
        sort: { field: 'fldRybsOKTZc5PqFq', direction: 'desc' },
        fields: {
          fld6XHZihWdiPdquj: 'Character ID',
          fld6RExWZ8AfVmOdt: 'Character Name',
          fld1Fg5JZ89TOvWeh: 'Status',
          fld2iASWP1myeye43: 'Canon Status',
          fldIwcfhozPKDWWfo: 'Protected',
          fldOXrNKFGoblRTcP: 'Species',
          fldMtu6vSLyId5c0j: 'Face Description',
          fldVPy8jPlQRoBlon: 'Eye Description',
          fldQlYisvBQHhvf1H: 'Hair or Fur Description',
          fldRybsOKTZc5PqFq: 'Last Updated'
        }
      }
    ]
  },
  nexarcana: {
    title: 'NEXARCANA',
    sections: [
      {
        name: 'NEXARCANA TAROT LIBRARY',
        tableId: 'tblbWh53mHad92JVM',
        pageSize: 25,
        fields: {
          flda12bGJbPgn1Zwa: 'Tarot ID',
          fld01JbaN5DdnwWWi: 'Nom',
          fld7co0N4n1mhvfco: 'Type',
          fldwbZZxJmtW8kEuL: 'Description',
          fldN96WxOoJsNOyMm: 'Pages / quantité',
          fldER9aHemMzVAo49: 'Dimensions',
          fld23vJ6vrdp1TrYl: 'Source / provenance',
          fldlkKGrYa4If53Cr: 'Utilisation dans NEXARCANA',
          fldkAsEhzDeeURTvs: 'Statut',
          fldBezLFhXyzqA3kY: 'Protégé'
        }
      }
    ]
  },
  nexcreate: {
    title: 'NEXCREATE — OMNI DRAW & BRUSH ENGINE',
    sections: [
      {
        name: 'OMNI DRAW & BRUSH ENGINE',
        tableId: 'tblx1PCDxIdSBAG7R',
        pageSize: 25,
        sort: { field: 'fldFDY94LxYDr7Ge6', direction: 'desc' },
        fields: {
          fldXD8j2gS4kWpPIZ: 'Feature ID',
          fldYAVGdI0cqebx3X: 'Module',
          fldJw2t4tiVthNjWq: 'Couche',
          fldLPiTL4zEt6RxvV: 'Fonction exacte',
          fldWaymh6BHvoIt6f: 'Sortie attendue',
          fldPE4mwGvSwG8FXf: 'Compatibilité Procreate',
          fldDjCYEHpbMgTSj2: 'Format cible',
          fld9gZpHAMu4qDQ9z: 'Statut',
          fldFDY94LxYDr7Ge6: 'Dernière mise à jour'
        }
      }
    ]
  },
  nyxcore: {
    title: 'NYXCORE — CERVEAU ACSTUDIO LIVE',
    sections: [
      {
        name: 'CERVEAU ACSTUDIO — LIVE',
        tableId: 'tblvCuHSNZlev1IFJ',
        pageSize: 25,
        sort: { field: 'fldHN52yXVueALMMe', direction: 'desc' },
        fields: {
          fldSfp8agbrwfNxzi: 'Module du cerveau',
          fldGooqUKZbQHB71f: 'Progression estimée',
          fldB74lh2zxRKDraa: 'Statut réel',
          fldiNKlfQtFUrRSNb: 'Disponibilité',
          fldd1CpYkw7qrjBI0: 'Preuves observées',
          fldzo5DIrrcl05Ral: 'Blocage actuel',
          fldJxiw0H5Sx3VbfC: 'Action suivante',
          fldH1JYj3VvJDNVUS: 'Source Airtable',
          fldHN52yXVueALMMe: 'Mise à jour'
        }
      }
    ]
  }
};

function cleanValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') return item;
      if (item && typeof item === 'object') return item.name || item.filename || item.id || '';
      return '';
    }).filter(Boolean);
  }
  if (typeof value === 'object') return value.name || value.filename || value.id || '';
  return value;
}

async function readSection(baseId, pat, section) {
  const params = new URLSearchParams();
  params.set('pageSize', String(section.pageSize || 10));
  params.set('returnFieldsByFieldId', 'true');
  Object.keys(section.fields).forEach((fieldId) => params.append('fields[]', fieldId));
  if (section.sort) {
    params.set('sort[0][field]', section.sort.field);
    params.set('sort[0][direction]', section.sort.direction || 'desc');
  }

  const response = await fetch(`https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(section.tableId)}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${pat}` }
  });

  if (!response.ok) {
    const error = new Error(`Airtable ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const payload = await response.json();
  const records = Array.isArray(payload.records) ? payload.records : [];
  return {
    name: section.name,
    table_id: section.tableId,
    count: records.length,
    records: records.map((record) => {
      const fields = {};
      Object.entries(section.fields).forEach(([fieldId, label]) => {
        const value = cleanValue(record.fields ? record.fields[fieldId] : undefined);
        if (value !== '' && !(Array.isArray(value) && value.length === 0)) fields[label] = value;
      });
      return { id: record.id, created_time: record.createdTime, fields };
    })
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const moduleKey = typeof req.query?.module === 'string' ? req.query.module.toLowerCase() : '';
  const config = MODULES[moduleKey];
  if (!config) return res.status(400).json({ ok: false, error: 'unknown_module' });

  const pat = process.env.ACSTUDIO_AIRTABLE_PAT;
  const baseId = process.env.ACSTUDIO_AIRTABLE_BASE_ID;
  if (!pat || !baseId) return res.status(503).json({ ok: false, error: 'missing_configuration' });

  try {
    const sections = [];
    for (const section of config.sections) sections.push(await readSection(baseId, pat, section));
    return res.status(200).json({
      ok: true,
      module: moduleKey,
      title: config.title,
      base_connected: true,
      sections,
      fetched_at: new Date().toISOString()
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      module: moduleKey,
      error: error?.status === 401 ? 'invalid_pat' : error?.status === 403 ? 'access_denied' : error?.status === 404 ? 'table_not_found' : 'airtable_request_failed'
    });
  }
}
