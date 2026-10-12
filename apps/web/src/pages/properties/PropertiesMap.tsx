import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Property } from '../../api/properties';
import type { Unit } from '../../api/units';

/** Riyadh — where the map opens when no property has coordinates yet. */
const DEFAULT_CENTER: [number, number] = [24.7136, 46.6753];

/**
 * Leaflet ships its marker icons as separate image files resolved relative to
 * the CSS. Vite fingerprints those, so the default icon 404s and markers render
 * as nothing at all. Drawing them as inline SVG avoids the asset pipeline
 * entirely — and lets the colour carry the occupancy, which a static PNG
 * couldn't.
 */
function pinIcon(color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="38" viewBox="0 0 26 38">
    <path d="M13 0C5.8 0 0 5.8 0 13c0 9.8 13 25 13 25s13-15.2 13-25c0-7.2-5.8-13-13-13z" fill="${color}"/>
    <circle cx="13" cy="13" r="5" fill="#fff"/>
  </svg>`;
  return L.icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`,
    iconSize: [26, 38],
    iconAnchor: [13, 38],
    popupAnchor: [0, -34],
  });
}

/** Colour by how full the property is — the one thing a landlord wants to see
 * at a glance across a portfolio. */
function occupancyColor(occupied: number, total: number): string {
  if (total === 0) return '#9ca3af';
  const ratio = occupied / total;
  if (ratio === 0) return '#dc2626';
  if (ratio < 1) return '#d97706';
  return '#16a34a';
}

export function PropertiesMap({ properties, units }: { properties: Property[]; units: Unit[] }) {
  const { t } = useTranslation();
  const mapped = useMemo(
    () =>
      properties
        .filter((p): p is Property & { lat: number; lng: number } => p.lat != null && p.lng != null)
        .map((p) => {
          const own = units.filter((u) => u.propertyId === p.id);
          const occupied = own.filter((u) => u.status === 'rented').length;
          return { property: p, total: own.length, occupied };
        }),
    [properties, units],
  );

  const withoutCoordinates = properties.length - mapped.length;

  const center = mapped.length > 0 ? ([mapped[0].property.lat, mapped[0].property.lng] as [number, number]) : DEFAULT_CENTER;

  return (
    <div>
      {withoutCoordinates > 0 && (
        // Says why the map looks emptier than the list, instead of leaving the
        // user to wonder.
        <p className="hint">
          {t('properties.map.without_coords', { n: withoutCoordinates, total: properties.length })}
        </p>
      )}

      {/* `isolation: isolate` gives the map its own stacking context, so
          Leaflet's internal z-indexes (panes and controls up to 1000) stay
          contained here and can't paint over the rest of the page. */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', isolation: 'isolate' }}>
        <MapContainer center={center} zoom={mapped.length > 0 ? 11 : 6} style={{ height: 460, width: '100%' }} scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {mapped.map(({ property, total, occupied }) => (
            <Marker key={property.id} position={[property.lat, property.lng]} icon={pinIcon(occupancyColor(occupied, total))}>
              <Popup>
                <strong>{property.name}</strong>
                <br />
                {property.address ?? '—'}
                <br />
                {total === 0 ? t('properties.map.no_units') : t('properties.map.rented_of', { occupied, total })}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
        {[
          { color: '#16a34a', label: t('properties.map.legend_full') },
          { color: '#d97706', label: t('properties.map.legend_partial') },
          { color: '#dc2626', label: t('properties.map.legend_vacant') },
          { color: '#9ca3af', label: t('properties.map.legend_empty') },
        ].map((l) => (
          <span key={l.label} className="hint" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: l.color, display: 'inline-block' }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}
