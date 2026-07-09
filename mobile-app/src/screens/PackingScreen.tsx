import { useRef, useState } from "react";
import { FlatList, Modal, StyleSheet, Text, TextInput, View } from "react-native";
import { confirmPacking, markPackingProblem, searchPacking } from "../api/mobileApi";
import { ErrorState } from "../components/ErrorState";
import { PackingProductCard } from "../components/ProductCard";
import { WorkerButton } from "../components/WorkerButton";
import type { MobilePackingSearchResult, MobileUser } from "../types/mobile";
import { ProductDetailsScreen } from "./ProductDetailsScreen";
import { ProductGalleryScreen } from "./ProductGalleryScreen";
import { webMobileDesign as design } from "../theme/webMobileDesign";

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
    backgroundColor: design.colors.background,
    flex: 1,
    paddingHorizontal: 14
  },
  searchCard: {
    ...design.card,
    gap: 12,
    marginTop: 12,
    padding: 14
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
  input: {
    backgroundColor: design.colors.surfaceMuted,
    borderColor: design.colors.borderStrong,
    borderRadius: design.radius.lg,
    borderWidth: 1,
    color: design.colors.text,
    fontSize: 18,
    fontWeight: design.text.weightBold,
    minHeight: design.sizes.inputHeight,
    paddingHorizontal: 14
  },
  message: {
    color: design.colors.successText,
    fontSize: 14,
    fontWeight: design.text.weightBold,
    paddingVertical: 10
  },
  list: {
    gap: 14,
    paddingBottom: 110,
    paddingTop: 12
  },
  sticky: {
    backgroundColor: design.colors.surface,
    borderTopColor: design.colors.border,
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
  }
});
