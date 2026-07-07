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

export function PickerScreen({ user }: { user: MobileUser }) {
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
      const response = await getPickerGroups();
      setItems(response.groups);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Picker data failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submitPicked(item: MobilePickerGroup) {
    setBusySku(item.sku);

    try {
      await markPicked({ sku: item.sku, color: item.color, size: item.size });
      await load();
    } catch (err) {
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
      await markPickerProblem({ sku: problemItem.sku, color: problemItem.color, size: problemItem.size, reason });
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
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No pick work ready</Text>
          <Text style={styles.emptyText}>Ask owner to upload today's orders or switch account on web.</Text>
        </View>
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
    color: "#0f172a",
    fontSize: 24,
    fontWeight: "900"
  },
  sub: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "700"
  },
  refresh: {
    minHeight: 42,
    paddingHorizontal: 12
  },
  list: {
    gap: 14,
    paddingBottom: 18
  },
  empty: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 16,
    borderWidth: 1,
    padding: 16
  },
  emptyTitle: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900"
  },
  emptyText: {
    color: "#64748b",
    fontSize: 14,
    marginTop: 6
  },
  modalShade: {
    backgroundColor: "rgba(15,23,42,0.45)",
    flex: 1,
    justifyContent: "flex-end"
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    gap: 12,
    padding: 18
  },
  modalTitle: {
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "900"
  },
  modalCopy: {
    color: "#475569",
    fontWeight: "800"
  },
  input: {
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
    borderRadius: 14,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 52,
    paddingHorizontal: 14
  }
});
