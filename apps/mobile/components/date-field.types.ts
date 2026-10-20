export interface DateFieldProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  compact?: boolean;
  disabled?: boolean;
  minimumDate?: string;
  maximumDate?: string;
}
