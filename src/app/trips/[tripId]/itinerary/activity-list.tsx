'use client';
import { CardToggle } from '../card-toggle';
import { Icon } from '../icons';
import { useState } from 'react';
import { DiscussionPanel } from '../discussion/discussion-panel';
import { InlineField } from '../../inline-field';
import { CardActions } from '../../card-actions';
import { useCardState } from '../../card-state';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Activity } from './activity-form';
export type ActivityChanges = Partial<
  Pick<Activity, 'title' | 'notes' | 'startTime' | 'endTime'>
>;
function formatTime(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}
function ActivityRow({
  revision,
  tripId,
  item,
  index,
  total,
  canEdit,
  busy,
  onEdit,
  onDelete,
  onMove,
  onSave,
  dropPosition,
}: {
  revision: number;
  tripId: string;
  item: Activity;
  index: number;
  total: number;
  canEdit: boolean;
  busy: boolean;
  onEdit: (item: Activity) => void;
  onDelete: (item: Activity) => void;
  onMove: (from: number, to: number) => void;
  onSave: (changes: ActivityChanges, revision?: number) => Promise<boolean>;
  dropPosition?: 'before' | 'after';
}) {
  const [cardState, updateCardState] = useCardState(`activity:${item.id}`);
  const expanded = cardState.expanded;
  const setExpanded = (expanded: boolean) => updateCardState({ expanded });
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !canEdit || busy });
  return (
    <li
      data-activity-id={item.id}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.65 : 1,
      }}
      className={`activity activity-card${isDragging ? ' is-dragging' : ''}${dropPosition ? ` drop-${dropPosition}` : ''}`}
    >
      <div className="time activity-time">
        {canEdit ? (
          <InlineField
            revision={revision}
            className="inline-time"
            label="Start time"
            type="time"
            value={item.startTime ?? ''}
            displayValue={
              item.startTime ? formatTime(item.startTime) : undefined
            }
            placeholder="Add time"
            disabled={busy}
            onSave={(value, revision) =>
              onSave({ startTime: value || null }, revision)
            }
          />
        ) : item.startTime ? (
          formatTime(item.startTime)
        ) : (
          'Any time'
        )}
        {item.endTime ? ` – ${formatTime(item.endTime)}` : ''}
      </div>
      <DiscussionPanel
        initial={item.discussion}
        expanded={expanded}
        onExpand={() => setExpanded(true)}
        tripId={tripId}
        target={{ resourceType: 'activity', resourceId: item.id }}
        title={item.title}
        summary={
          <CardToggle
            revision={revision}
            title={item.title}
            notes={item.notes}
            expanded={expanded}
            onToggle={() => setExpanded(!expanded)}
            busy={busy}
            onSaveTitle={
              canEdit
                ? (title, revision) => onSave({ title }, revision)
                : undefined
            }
            onSaveNotes={
              canEdit
                ? (notes, revision) => onSave({ notes }, revision)
                : undefined
            }
            tools={
              canEdit && (
                <>
                  <CardActions
                    title={item.title}
                    busy={busy}
                    actions={[
                      { label: 'Edit details', onClick: () => onEdit(item) },
                      {
                        label: `Move ${item.title} up`,
                        disabled: index === 0,
                        onClick: () => onMove(index, index - 1),
                      },
                      {
                        label: `Move ${item.title} down`,
                        disabled: index === total - 1,
                        onClick: () => onMove(index, index + 1),
                      },
                      {
                        label: `Remove ${item.title}`,
                        danger: true,
                        onClick: () => onDelete(item),
                      },
                    ]}
                  />
                  <button
                    {...attributes}
                    {...listeners}
                    className="icon drag-handle desktop-drag-handle"
                    disabled={busy}
                    aria-label={`Reorder ${item.title}`}
                    title="Drag to reorder"
                  >
                    <Icon name="grip" />
                  </button>
                </>
              )
            }
          />
        }
      >
        {item.url && (
          <a
            className="small-link"
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="link" />
            {new URL(item.url).hostname.replace(/^www\./, '')}
            <span className="sr-only"> for {item.title} (new tab)</span>
          </a>
        )}
        {canEdit && (
          <div className="detail-actions bookmark-actions">
            <button
              aria-label={`Edit ${item.title}`}
              disabled={busy}
              onClick={() => onEdit(item)}
            >
              <Icon name="edit" />
              Edit activity<span className="sr-only"> {item.title}</span>
            </button>
            <button disabled={busy} onClick={() => onDelete(item)}>
              <Icon name="trash" />
              Remove<span className="sr-only"> {item.title}</span>
            </button>
          </div>
        )}
      </DiscussionPanel>
    </li>
  );
}
export function ActivityList({
  revision,
  tripId,
  items,
  canEdit,
  busy,
  onEdit,
  onDelete,
  onOrder,
  onSave,
}: {
  revision: number;
  tripId: string;
  items: Activity[];
  canEdit: boolean;
  busy: boolean;
  onEdit: (item: Activity) => void;
  onDelete: (item: Activity) => void;
  onOrder: (ids: string[]) => Promise<boolean>;
  onSave: (
    item: Activity,
    changes: ActivityChanges,
    revision?: number,
  ) => Promise<boolean>;
}) {
  const [preview, setPreview] = useState<{
    source: Activity[];
    ids: string[];
  } | null>(null);
  const [drag, setDrag] = useState<{ active: string; over?: string } | null>(
    null,
  );
  const ordered =
    preview?.source === items
      ? preview.ids
          .map((id) => items.find((item) => item.id === id)!)
          .filter(Boolean)
      : items;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  async function move(from: number, to: number) {
    if (busy || from < 0 || to < 0 || from === to) return;
    const ids = arrayMove(ordered, from, to).map((item) => item.id);
    setPreview({ source: items, ids });
    if (!(await onOrder(ids))) setPreview(null);
  }
  return (
    <DndContext
      id="itinerary-order"
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={({ active }) => setDrag({ active: String(active.id) })}
      onDragOver={({ over }) =>
        setDrag(
          (current) =>
            current && { ...current, over: over ? String(over.id) : undefined },
        )
      }
      onDragCancel={() => setDrag(null)}
      onDragEnd={({ active, over }) => {
        setDrag(null);
        if (over)
          void move(
            ordered.findIndex((i) => i.id === active.id),
            ordered.findIndex((i) => i.id === over.id),
          );
      }}
    >
      <SortableContext
        items={ordered.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <ol className="activity-list" aria-busy={busy}>
          {ordered.map((item, index) => (
            <ActivityRow
              revision={revision}
              tripId={tripId}
              key={item.id}
              item={item}
              index={index}
              total={items.length}
              canEdit={canEdit}
              busy={busy}
              onEdit={onEdit}
              onDelete={onDelete}
              onMove={(from, to) => void move(from, to)}
              onSave={(changes, revision) => onSave(item, changes, revision)}
              dropPosition={
                drag?.over === item.id && drag.active !== item.id
                  ? ordered.findIndex((row) => row.id === drag.active) < index
                    ? 'after'
                    : 'before'
                  : undefined
              }
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}
