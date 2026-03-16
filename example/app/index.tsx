import React, { useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";


import { ExampleReferenceScreen } from "./reference";
import { ExampleVerifyScreen } from "./verify";
import {
  getExampleSdkRuntime,
  getIsTestModeFromEnv,
} from "../src/sdkRuntime/faceZkSdkExample";
import type { ReferenceTemplate } from "@jmdt/face-zk-sdk";

type ExampleStage = "FORM" | "ENROLL" | "VERIFY" | "DONE";

interface FormState {
  name: string;
  mobile: string;
  yearOfBirth: string;
  locality: string;
}

export default function ExampleKycFlowScreen() {
  const [stage, setStage] = useState<ExampleStage>("FORM");
  const [form, setForm] = useState<FormState>({
    name: "",
    mobile: "",
    yearOfBirth: "",
    locality: "",
  });
  const [referenceTemplate, setReferenceTemplate] = useState<ReferenceTemplate | null>(
    null,
  );

  const isTestMode = useMemo(() => getIsTestModeFromEnv(), []);
  const runtime = useMemo(() => getExampleSdkRuntime(isTestMode), [isTestMode]);

  const handleStart = () => {
    if (!isTestMode) {
      if (!form.name || !form.mobile || !form.yearOfBirth || !form.locality) {
        Alert.alert("Missing details", "Please fill all fields before continuing.");
        return;
      }
    }

    setStage("ENROLL");
  };

  const handleEnrollmentComplete = (template: ReferenceTemplate) => {
    setReferenceTemplate(template);
    setStage("VERIFY");
  };

  const handleVerificationDone = () => {
    setStage("DONE");
  };

  const resetFlow = () => {
    setStage("FORM");
    setReferenceTemplate(null);
  };

  if (stage === "ENROLL") {
    return (
      <ExampleReferenceScreen
        runtime={runtime}
        onComplete={handleEnrollmentComplete}
        onCancel={resetFlow}
      />
    );
  }

  if (stage === "VERIFY" && referenceTemplate) {
    return (
      <ExampleVerifyScreen
        runtime={runtime}
        reference={referenceTemplate}
        onDone={handleVerificationDone}
        onCancel={resetFlow}
      />
    );
  }

  if (stage === "DONE") {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>SDK Example Complete</Text>
        <Text style={styles.subtitle}>
          The example flow has finished. You can now adapt this pattern into your
          own routes and screens.
        </Text>
        <Pressable style={styles.primaryButton} onPress={resetFlow}>
          <Text style={styles.primaryButtonText}>Run Again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.formContainer}>
      <Text style={styles.badge}>
        {isTestMode ? "TEST MODE (form validation bypassed)" : "PRODUCTION MODE"}
      </Text>
      <Text style={styles.title}>Face+ZK SDK Example</Text>
      <Text style={styles.subtitle}>
        This screen mimics a basic KYC input form. In test mode, you can skip filling
        the fields and still run the full SDK flow.
      </Text>

      <Text style={styles.label}>Full Name</Text>
      <TextInput
        style={styles.input}
        placeholder="Jane Doe"
        placeholderTextColor="#64748b"
        value={form.name}
        onChangeText={(name) => setForm((prev) => ({ ...prev, name }))}
      />

      <Text style={styles.label}>Mobile Number</Text>
      <TextInput
        style={styles.input}
        placeholder="+91 99999 00000"
        placeholderTextColor="#64748b"
        keyboardType="phone-pad"
        value={form.mobile}
        onChangeText={(mobile) => setForm((prev) => ({ ...prev, mobile }))}
      />

      <Text style={styles.label}>Year of Birth</Text>
      <TextInput
        style={styles.input}
        placeholder="1995"
        placeholderTextColor="#64748b"
        keyboardType="numeric"
        value={form.yearOfBirth}
        onChangeText={(yearOfBirth) =>
          setForm((prev) => ({
            ...prev,
            yearOfBirth,
          }))
        }
      />

      <Text style={styles.label}>Locality</Text>
      <TextInput
        style={styles.input}
        placeholder="Bengaluru"
        placeholderTextColor="#64748b"
        value={form.locality}
        onChangeText={(locality) => setForm((prev) => ({ ...prev, locality }))}
      />

      <Pressable style={styles.primaryButton} onPress={handleStart}>
        <Text style={styles.primaryButtonText}>Start Face+ZK Flow</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  formContainer: {
    padding: 24,
    gap: 12,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#0f172a",
    color: "#e5e7eb",
    fontSize: 12,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#e5e7eb",
  },
  subtitle: {
    fontSize: 14,
    color: "#9ca3af",
    marginBottom: 16,
  },
  label: {
    marginTop: 4,
    marginBottom: 4,
    fontSize: 13,
    color: "#9ca3af",
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1f2937",
    backgroundColor: "#020617",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#e5e7eb",
    fontSize: 14,
  },
  primaryButton: {
    marginTop: 24,
    borderRadius: 999,
    backgroundColor: "#22c55e",
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#022c22",
    fontSize: 15,
    fontWeight: "600",
  },
});

