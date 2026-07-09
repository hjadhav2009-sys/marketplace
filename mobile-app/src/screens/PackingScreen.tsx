import { useRef, useState } from "react";
import { FlatList, Modal, StyleSheet, Text, TextInput, View } from "react-native";
import { confirmPacking, markPackingProblem, searchPacking } from "../api/mobileApi";
import { ErrorState } from "../components/ErrorState";
import { PackingProductCard } from "../components/ProductCard";
import { WorkerButton } from "../components/WorkerButton";
import type { MobilePackingSearchResult, MobileUser } from "../types/mobile";
import { ProductDetailsScreen } from "./ProductDetailsScreen";
import { ProductGalleryScreen } from "./ProductGalleryScreen";

export function PackingScreen({ user }: { user: MobileUser }) {
  const inputRef = useRef<TextInput>(null);
  const [code, setCode] = useState("");
  const [results, setResults] = useState<MobilePackingSearchResult[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [gallerySku, setGallerySku] = useState<string | null>(null);
  const [detailsSku, setDetailsSku] = useState<string | null>(null);
  const [problemOrder, setProblemOrder] = useState<MobilePackingSearchResult | null>(null);
  const [reason, setReason] = useState("");

  async function runSearch(nextCode = code) {
    const trimmed = nextCode.trim();

    if (!trimmed) {
      setError("Enter or scan Tracking ID / AWB.");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response = await searchPacking(trimmed);
      setResults(response.results);
      setMessage(response.results.length ? `${response.results.length} item(s) found.` : "No matching order found.");
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setBusy(false);
    }
  }

  async function packByCode() {
    const targetCode = code.trim() || results[0]?.trackingId || results[0]?.awb || "";

    if (!targetCode) {
      return;
    }

    setBusy(true);
    setError(null);
    const previousResults = results;
    setResults((current) => current.map((item) => (item.canPack ? { ...item, canPack: false, packStatus: "PACKING" } : item)));

    try {
      const response = await confirmPacking({ code: targetCode });
      setMessage(`Packed ${response.packedCount}. Skipped ${response.skippedCount}.`);
      setCode("");
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 150);
    } catch (err) {
      setResults(previousResults);
      setError(err instanceof Error ? err.message : "Pack failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitProblem() {
    if (!problemOrder) {
      return;
    }

    setBusy(true);

    try {
      await markPackingProblem({ orderId: problemOrder.orderId, reason });
      setProblemOrder(null);
      setReason("");
      setMessage("Problem saved.");
      await runSearch(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Problem failed.");
    } finally {
      setBusy(false);
    }
  }

  if (scannerOpen) {
    const { ScannerScreen } = require("./ScannerScreen") as typeof import("./ScannerScreen");

    return (
      <ScannerScreen
        onCancel={() => setScannerOpen(false)}
        onScanned={(value) => {
          setScannerOpen(false);
          setCode(value);
          runSearch(value);
        }}
      />
    );
  }

  if (gallerySku) {
    return <ProductGalleryScreen sku={gallerySku} onBack={() => setGallerySku(null)} />;
  }

  if (detailsSku) {
    return <ProductDetailsScreen sku={detailsSku} onBack={() => setDetailsSku(null)} onOpenGallery={() => setGallerySku(detailsSku)} />;
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.searchCard}>
        <Text style={styles.title}>Packing</Text>
        <Text style={styles.sub}>Manual Tracking ID / AWB first. Scanner is optional.</Text>
        <TextInput
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus
          onChangeText={setCode}
          onSubmitEditing={() => runSearch()}
          placeholder="FMPC0000000000"
          ref={inputRef}
          style={styles.input}
          value={code}
        />
        <WorkerButton onPress={() => runSearch()} loading={busy}>Find order</WorkerButton>
        <WorkerButton onPress={() => setScannerOpen(true)} variant="secondary">Scan barcode</WorkerButton>
      </View>
      {error ? <ErrorState message={error} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <FlatList
        contentContainerStyle={styles.list}
        data={results}
        keyExtractor={(item) => item.orderId}
        renderItem={({ item }) => (
          <PackingProductCard
            item={item}
            onImage={() => setGallerySku(item.sku)}
            onDetails={() => setDetailsSku(item.sku)}
            onPack={packByCode}
            onProblem={() => setProblemOrder(item)}
            busy={busy}
          />
        )}
      />
      {results.some((item) => item.canPack) ? (
        <View style={styles.sticky}>
          <WorkerButton onPress={packByCode} loading={busy}>Pack ready items</WorkerButton>
          <WorkerButton
            onPress={() => {
              setCode("");
              setResults([]);
              setMessage(null);
              inputRef.current?.focus();
            }}
            variant="secondary"
          >
            Scan next
          </WorkerButton>
        </View>
      ) : null}
      <Modal transparent visible={Boolean(problemOrder)} animationType="slide" onRequestClose={() => setProblemOrder(null)}>
        <View style={styles.modalShade}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Packing problem</Text>
            <Text style={styles.modalCopy}>{problemOrder?.sku}</Text>
            <TextInput autoFocus onChangeText={setReason} placeholder="Reason" style={styles.input} value={reason} />
            <WorkerButton onPress={submitProblem} disabled={reason.trim().length < 3} loading={busy}>Submit problem</WorkerButton>
            <WorkerButton onPress={() => setProblemOrder(null)} variant="secondary">Cancel</WorkerButton>
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
  searchCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    marginTop: 12,
    padding: 14
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
  input: {
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
    borderRadius: 14,
    borderWidth: 1,
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "800",
    minHeight: 54,
    paddingHorizontal: 14
  },
  message: {
    color: "#166534",
    fontSize: 14,
    fontWeight: "800",
    paddingVertical: 10
  },
  list: {
    gap: 14,
    paddingBottom: 110,
    paddingTop: 12
  },
  sticky: {
    backgroundColor: "#ffffff",
    borderTopColor: "#e2e8f0",
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: "row",
    gap: 10,
    left: 0,
    padding: 12,
    position: "absolute",
    right: 0
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
  }
});
