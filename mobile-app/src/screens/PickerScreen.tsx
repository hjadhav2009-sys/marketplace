import { useCallback, useEffect, useState } from "react";
import { FlatList, Modal, StyleSheet, Text, TextInput, View } from "react-native";
import { getPickerGroups, markPicked, markPickerProblem } from "../api/mobileApi";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { PickerProductCard } from "../components/ProductCard";
import { WorkerButton } from "../components/WorkerButton";
import type { MobilePickerGroup, MobileUser } from "../types/mobile";
import { ProductGalleryScreen } from "./ProductGalleryScreen";
import { ProductDetailsScreen } from "./ProductDetailsScreen";
import { EmptyState } from "../components/EmptyState";
import { webMobileDesign as design } from "../theme/webMobileDesign";

let cachedPickerGroups: { accountId: string | null; at: number; groups: MobilePickerGroup[] } | null = null;

export function PickerScreen({ user }: { user: MobileUser }) {
  const selectedAccountId = user.selectedAccount?.id ?? null;
  const [items, setItems] = useState<MobilePickerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busySku, setBusySku] = useState<string | null>(null);
  const [gallerySku, setGallerySku] = useState<string | null>(null);
  const [detailsSku, setDetailsSku] = useState<string | null>(null);
  const [problemItem, setProblemItem] = useState<MobilePickerGroup | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (cachedPickerGroups && cachedPickerGroups.accountId === selectedAccountId && Date.now() - cachedPickerGroups.at < 15_000) {
        setItems(cachedPickerGroups.groups);
        setLoading(false);
      }

      const response = await getPickerGroups(selectedAccountId ?? undefined);
      cachedPickerGroups = { accountId: selectedAccountId, at: Date.now(), groups: response.groups };
      setItems(response.groups);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Picker data failed to load.");
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    load();
  }, [load]);

  async function submitPicked(item: MobilePickerGroup) {
    setBusySku(item.sku);
    const previousItems = items;
    const key = `${item.sku}:${item.color ?? ""}:${item.size ?? ""}`;
    const nextItems = previousItems
      .map((candidate) =>
        `${candidate.sku}:${candidate.color ?? ""}:${candidate.size ?? ""}` === key
          ? { ...candidate, pendingCount: Math.max(0, candidate.pendingCount - 1), pickedCount: candidate.pickedCount + 1 }
          : candidate
      )
      .filter((candidate) => candidate.pendingCount > 0);
    setItems(nextItems);

    try {
      await markPicked({ sku: item.sku, color: item.color, size: item.size, accountId: selectedAccountId ?? undefined });
      cachedPickerGroups = null;
      await load();
    } catch (err) {
      setItems(previousItems);
      setError(err instanceof Error ? err.message : "Could not mark picked.");
    } finally {
      setBusySku(null);
    }
  }

  async function submitProblem() {
    if (!problemItem) {
      return;
    }

    setBusySku(problemItem.sku);

    try {
      await markPickerProblem({ sku: problemItem.sku, color: problemItem.color, size: problemItem.size, reason, accountId: selectedAccountId ?? undefined });
      setProblemItem(null);
      setReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark problem.");
    } finally {
      setBusySku(null);
    }
  }

  if (gallerySku) {
    return <ProductGalleryScreen sku={gallerySku} onBack={() => setGallerySku(null)} />;
  }

  if (detailsSku) {
    return <ProductDetailsScreen sku={detailsSku} onBack={() => setDetailsSku(null)} onOpenGallery={() => setGallerySku(detailsSku)} />;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <View>
          <Text style={styles.title}>Picker</Text>
          <Text style={styles.sub}>{user.accounts.length} assigned account(s)</Text>
        </View>
        <WorkerButton onPress={load} variant="secondary" style={styles.refresh}>Refresh</WorkerButton>
      </View>
      {loading ? <LoadingState label="Loading pick work..." /> : null}
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState title="No pick work ready" message="Ask owner to upload today's orders or switch account on web." actionLabel="Refresh" onAction={load} />
      ) : null}
      <FlatList
        contentContainerStyle={styles.list}
        data={items}
        keyExtractor={(item) => `${item.sku}:${item.color ?? ""}:${item.size ?? ""}`}
        renderItem={({ item }) => (
          <PickerProductCard
            item={item}
            onImage={() => setGallerySku(item.sku)}
            onDetails={() => setDetailsSku(item.sku)}
            onPicked={() => submitPicked(item)}
            onProblem={() => setProblemItem(item)}
            busy={busySku === item.sku}
          />
        )}
      />
      <Modal transparent visible={Boolean(problemItem)} animationType="slide" onRequestClose={() => setProblemItem(null)}>
        <View style={styles.modalShade}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Mark problem</Text>
            <Text style={styles.modalCopy}>{problemItem?.sku}</Text>
            <TextInput
              autoFocus
              onChangeText={setReason}
              placeholder="Reason"
              style={styles.input}
              value={reason}
            />
            <WorkerButton onPress={submitProblem} disabled={reason.trim().length < 3} loading={Boolean(problemItem && busySku === problemItem.sku)}>Submit problem</WorkerButton>
            <WorkerButton onPress={() => setProblemItem(null)} variant="secondary">Cancel</WorkerButton>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: design.colors.background,
    flex: 1,
    paddingHorizontal: 14
  },
  top: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12
  },
  title: {
    color: design.colors.text,
    fontSize: design.text.xl,
    fontWeight: design.text.weightBlack
  },
  sub: {
    color: design.colors.textMuted,
    fontSize: 13,
    fontWeight: design.text.weightMedium
  },
  refresh: {
    minHeight: 42,
    paddingHorizontal: 12
  },
  list: {
    gap: 14,
    paddingBottom: 18
  },
  modalShade: {
    backgroundColor: design.colors.overlaySoft,
    flex: 1,
    justifyContent: "flex-end"
  },
  modalCard: {
    backgroundColor: design.colors.surface,
    borderTopLeftRadius: design.radius.sheet,
    borderTopRightRadius: design.radius.sheet,
    gap: 12,
    padding: 18
  },
  modalTitle: {
    color: design.colors.text,
    fontSize: 22,
    fontWeight: design.text.weightBlack
  },
  modalCopy: {
    color: design.colors.textSubtle,
    fontWeight: design.text.weightBold
  },
  input: {
    backgroundColor: design.colors.surfaceMuted,
    borderColor: design.colors.borderStrong,
    borderRadius: design.radius.lg,
    borderWidth: 1,
    fontSize: 16,
    minHeight: design.sizes.inputHeight,
    paddingHorizontal: 14
  }
});
