import React from "react";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { RsProfileForm } from "../features/rs-profiles/form";
jest.mock("../components/ui", () => {
  const { Text, TextInput, Pressable } = jest.requireActual("react-native");
  return {
    Txt: ({ children }: { children: React.ReactNode }) => (
      <Text>{children}</Text>
    ),
    Input: (props: object) => <TextInput {...props} />,
    Button: ({
      title,
      onPress,
      disabled,
    }: {
      title: string;
      onPress: () => void;
      disabled: boolean;
    }) => (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        disabled={disabled}
      >
        <Text>{title}</Text>
      </Pressable>
    ),
  };
});
test("accepts an RS username and short password without app login", async () => {
  const save = jest.fn(async () => {});
  const screen = await render(<RsProfileForm onSave={save} />);
  await fireEvent.changeText(screen.getByLabelText("Profile name"), "Company");
  await fireEvent.changeText(
    screen.getByLabelText("RS username"),
    "ordinary_username",
  );
  await fireEvent.changeText(screen.getByLabelText("RS password"), "1");
  await fireEvent.changeText(
    screen.getByLabelText("Taxpayer ID"),
    "60003008009",
  );
  await act(async () => {
    await fireEvent.press(screen.getByText("შენახვა"));
  });
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith({
      name: "Company",
      username: "ordinary_username",
      password: "1",
      taxpayerId: "60003008009",
    }),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("RS password").props.value).toBe(""),
  );
});
test("shows save errors without dropping the entered credentials", async () => {
  const save = jest.fn(async () => {
    throw new Error("Save failed");
  });
  const screen = await render(
    <RsProfileForm
      initial={{ name: "Company", username: "account" }}
      onSave={save}
    />,
  );
  await fireEvent.changeText(screen.getByLabelText("RS password"), "x");
  await act(async () => {
    await fireEvent.press(screen.getByText("შენახვა"));
  });
  await waitFor(() => expect(screen.getByText("Save failed")).toBeTruthy());
  expect(screen.getByLabelText("RS password").props.value).toBe("x");
});
