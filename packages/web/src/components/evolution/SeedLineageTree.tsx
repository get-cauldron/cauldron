'use client';

export interface SeedLineageNode {
  id: string;
  parentId: string | null;
  generation: number;
  goal: string;
  acceptanceCriteria: unknown[];
  status: string;
  createdAt: string;
}

interface SeedLineageTreeProps {
  seeds: SeedLineageNode[];
  selectedSeedId: string | null;
  onSelectSeed: (id: string) => void;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'Draft', color: '#6b8399', bg: 'rgba(107,131,153,0.15)' },
  crystallized: { label: 'Crystallized', color: '#00d4aa', bg: 'rgba(0,212,170,0.15)' },
};

export function SeedLineageTree({
  seeds,
  selectedSeedId,
  onSelectSeed,
}: SeedLineageTreeProps) {
  if (seeds.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 32,
          gap: 8,
          height: '100%',
        }}
      >
        <span
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: '#c8d6e5',
          }}
        >
          No evolution cycles yet
        </span>
        <span
          style={{
            fontSize: 14,
            color: '#6b8399',
            textAlign: 'center',
            maxWidth: 320,
          }}
        >
          Evolution begins after the first execution cycle completes evaluation.
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        overflowY: 'auto',
        padding: '8px 0',
      }}
    >
      {seeds.map((seed, index) => {
        const isSelected = selectedSeedId === seed.id;
        const statusBadge = STATUS_BADGE[seed.status] ?? {
          label: seed.status,
          color: '#6b8399',
          bg: 'rgba(107,131,153,0.15)',
        };

        // Detect goal change from parent
        const parentSeed = index > 0 ? seeds[index - 1] : null;
        const goalChanged = parentSeed && parentSeed.goal !== seed.goal;

        return (
          <div
            key={seed.id}
            style={{ display: 'flex', alignItems: 'stretch', position: 'relative' }}
          >
            {/* Vertical connector line */}
            {index > 0 && (
              <div
                style={{
                  position: 'absolute',
                  left: 20,
                  top: 0,
                  width: 2,
                  height: 12,
                  background: '#1a2330',
                  zIndex: 1,
                }}
              />
            )}

            {/* Seed node card */}
            <div
              style={{
                flex: 1,
                marginTop: index > 0 ? 12 : 0,
                marginLeft: 8,
                marginRight: 8,
                background: isSelected ? '#1a2330' : '#111820',
                border: `1px solid ${isSelected ? '#00d4aa' : '#1a2330'}`,
                borderLeft: `4px solid ${isSelected ? '#00d4aa' : '#1a2330'}`,
                borderRadius: 6,
                padding: '10px 12px',
                cursor: 'pointer',
                transition: 'all 150ms cubic-bezier(0.25,0.46,0.45,0.94)',
              }}
              onClick={() => onSelectSeed(seed.id)}
            >
              {/* Header row: generation badge + status + goal-changed indicator */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 6,
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#0a0f14',
                    background: '#3d5166',
                    padding: '2px 6px',
                    borderRadius: 10,
                  }}
                >
                  Gen {seed.generation}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: statusBadge.color,
                    background: statusBadge.bg,
                    padding: '2px 8px',
                    borderRadius: 10,
                    border: `1px solid ${statusBadge.color}`,
                  }}
                >
                  {statusBadge.label}
                </span>
                {goalChanged && (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#f5a623',
                      background: 'rgba(245,166,35,0.15)',
                      padding: '2px 8px',
                      borderRadius: 10,
                      border: '1px solid #f5a623',
                    }}
                  >
                    changed
                  </span>
                )}
              </div>

              {/* Goal text — 2 lines max */}
              <p
                style={{
                  fontSize: 14,
                  color: '#c8d6e5',
                  lineHeight: 1.5,
                  margin: '0 0 6px',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {seed.goal}
              </p>

              {/* Footer: date */}
              <span style={{ fontSize: 12, color: '#6b8399' }}>
                {formatDate(seed.createdAt)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
