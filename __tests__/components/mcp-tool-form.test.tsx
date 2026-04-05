import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { McpToolForm } from "@/components/mcp-tool-form";

describe("McpToolForm", () => {
  describe("AC-2: dynamic form generation", () => {
    it("AC-2.1: renders a text input for a string property", () => {
      // Arrange
      const schema = {
        type: "object" as const,
        properties: { username: { type: "string" } },
      };
      // Act
      render(
        <McpToolForm
          schema={schema}
          values={{}}
          onChange={vi.fn()}
        />
      );
      // Assert
      expect(screen.getByRole("textbox")).toBeInTheDocument();
    });

    it("AC-2.2: renders a number input for a number property", () => {
      // Arrange
      const schema = {
        type: "object" as const,
        properties: { count: { type: "number" } },
      };
      // Act
      render(
        <McpToolForm
          schema={schema}
          values={{}}
          onChange={vi.fn()}
        />
      );
      // Assert — spinbutton is the ARIA role for type="number"
      expect(screen.getByRole("spinbutton")).toBeInTheDocument();
    });

    it("AC-2.2: renders a number input for an integer property", () => {
      // Arrange
      const schema = {
        type: "object" as const,
        properties: { page: { type: "integer" } },
      };
      // Act
      render(
        <McpToolForm
          schema={schema}
          values={{}}
          onChange={vi.fn()}
        />
      );
      // Assert
      expect(screen.getByRole("spinbutton")).toBeInTheDocument();
    });

    it("AC-2.3: renders a checkbox for a boolean property", () => {
      // Arrange
      const schema = {
        type: "object" as const,
        properties: { enabled: { type: "boolean" } },
      };
      // Act
      render(
        <McpToolForm
          schema={schema}
          values={{}}
          onChange={vi.fn()}
        />
      );
      // Assert
      expect(screen.getByRole("checkbox")).toBeInTheDocument();
    });

    it("AC-2.4: renders a select/dropdown for a property with enum values", () => {
      // Arrange
      const schema = {
        type: "object" as const,
        properties: {
          status: { type: "string", enum: ["active", "inactive", "pending"] },
        },
      };
      // Act
      render(
        <McpToolForm
          schema={schema}
          values={{}}
          onChange={vi.fn()}
        />
      );
      // Assert
      expect(screen.getByRole("combobox")).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "active" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "inactive" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "pending" })).toBeInTheDocument();
    });

    it("AC-2.5: marks required fields with a visible indicator", () => {
      // Arrange
      const schema = {
        type: "object" as const,
        properties: {
          name: { type: "string" },
          notes: { type: "string" },
        },
        required: ["name"],
      };
      // Act
      render(
        <McpToolForm
          schema={schema}
          values={{}}
          onChange={vi.fn()}
        />
      );
      // Assert — required indicator (asterisk or "required" text) present for required field
      // Use a loose match since it may be *, "required", or aria-required
      const nameLabel = screen.getByText(/name/i);
      expect(nameLabel.closest("label") ?? nameLabel.parentElement).toHaveTextContent(/\*|required/i);
    });

    it("AC-2.6: uses description as label when description is provided", () => {
      // Arrange
      const schema = {
        type: "object" as const,
        properties: {
          q: { type: "string", description: "Search query string" },
        },
      };
      // Act
      render(
        <McpToolForm
          schema={schema}
          values={{}}
          onChange={vi.fn()}
        />
      );
      // Assert — description text is visible, not property key
      expect(screen.getByText(/search query string/i)).toBeInTheDocument();
    });

    it("AC-2.6: falls back to property name as label when no description is provided", () => {
      // Arrange
      const schema = {
        type: "object" as const,
        properties: {
          repositoryUrl: { type: "string" },
        },
      };
      // Act
      render(
        <McpToolForm
          schema={schema}
          values={{}}
          onChange={vi.fn()}
        />
      );
      // Assert
      expect(screen.getByText(/repositoryUrl/i)).toBeInTheDocument();
    });

    it("AC-2.7: renders a 'no parameters required' message when schema has no properties", () => {
      // Arrange
      const schema = { type: "object" as const };
      // Act
      render(
        <McpToolForm
          schema={schema}
          values={{}}
          onChange={vi.fn()}
        />
      );
      // Assert
      expect(screen.getByText(/no parameters required/i)).toBeInTheDocument();
    });

    it("AC-2.7: renders empty-state message when properties is an empty object", () => {
      // Arrange
      const schema = { type: "object" as const, properties: {} };
      // Act
      render(
        <McpToolForm
          schema={schema}
          values={{}}
          onChange={vi.fn()}
        />
      );
      // Assert
      expect(screen.getByText(/no parameters required/i)).toBeInTheDocument();
    });

    it("AC-2.8: calls onChange with updated values when a text input changes", () => {
      // Arrange
      const handleChange = vi.fn();
      const schema = {
        type: "object" as const,
        properties: { repo: { type: "string" } },
      };
      render(
        <McpToolForm
          schema={schema}
          values={{ repo: "" }}
          onChange={handleChange}
        />
      );
      const input = screen.getByRole("textbox");
      // Act
      fireEvent.change(input, { target: { value: "my-repo" } });
      // Assert
      expect(handleChange).toHaveBeenCalledOnce();
      expect(handleChange).toHaveBeenCalledWith({ repo: "my-repo" });
    });

    it("AC-2.8: calls onChange with updated values when a number input changes", () => {
      // Arrange
      const handleChange = vi.fn();
      const schema = {
        type: "object" as const,
        properties: { limit: { type: "number" } },
      };
      render(
        <McpToolForm
          schema={schema}
          values={{ limit: 0 }}
          onChange={handleChange}
        />
      );
      const input = screen.getByRole("spinbutton");
      // Act
      fireEvent.change(input, { target: { value: "42" } });
      // Assert
      expect(handleChange).toHaveBeenCalledOnce();
      expect(handleChange).toHaveBeenCalledWith({ limit: 42 });
    });

    it("AC-2.8: calls onChange with updated values when a checkbox changes", () => {
      // Arrange
      const handleChange = vi.fn();
      const schema = {
        type: "object" as const,
        properties: { verbose: { type: "boolean" } },
      };
      render(
        <McpToolForm
          schema={schema}
          values={{ verbose: false }}
          onChange={handleChange}
        />
      );
      const checkbox = screen.getByRole("checkbox");
      // Act
      fireEvent.click(checkbox);
      // Assert
      expect(handleChange).toHaveBeenCalledOnce();
      expect(handleChange).toHaveBeenCalledWith({ verbose: true });
    });

    it("AC-2.8: calls onChange with updated values when a select changes", () => {
      // Arrange
      const handleChange = vi.fn();
      const schema = {
        type: "object" as const,
        properties: {
          format: { type: "string", enum: ["json", "csv", "xml"] },
        },
      };
      render(
        <McpToolForm
          schema={schema}
          values={{ format: "json" }}
          onChange={handleChange}
        />
      );
      const select = screen.getByRole("combobox");
      // Act
      fireEvent.change(select, { target: { value: "csv" } });
      // Assert
      expect(handleChange).toHaveBeenCalledOnce();
      expect(handleChange).toHaveBeenCalledWith({ format: "csv" });
    });

    it("AC-2.9: disables all inputs when disabled prop is true", () => {
      // Arrange
      const schema = {
        type: "object" as const,
        properties: {
          name: { type: "string" },
          count: { type: "number" },
          active: { type: "boolean" },
        },
      };
      // Act
      render(
        <McpToolForm
          schema={schema}
          values={{}}
          onChange={vi.fn()}
          disabled={true}
        />
      );
      // Assert — every interactive element should be disabled
      screen.getAllByRole("textbox").forEach((el) => {
        expect(el).toBeDisabled();
      });
      screen.getAllByRole("spinbutton").forEach((el) => {
        expect(el).toBeDisabled();
      });
      screen.getAllByRole("checkbox").forEach((el) => {
        expect(el).toBeDisabled();
      });
    });

    it("AC-2.9: inputs are NOT disabled when disabled prop is false", () => {
      // Arrange
      const schema = {
        type: "object" as const,
        properties: { name: { type: "string" } },
      };
      // Act
      render(
        <McpToolForm
          schema={schema}
          values={{}}
          onChange={vi.fn()}
          disabled={false}
        />
      );
      // Assert
      expect(screen.getByRole("textbox")).not.toBeDisabled();
    });

    it("AC-2.10: renders one field per property for a multi-property schema", () => {
      // Arrange
      const schema = {
        type: "object" as const,
        properties: {
          owner: { type: "string", description: "Repository owner" },
          repo: { type: "string", description: "Repository name" },
          page: { type: "integer", description: "Page number" },
          includeArchived: { type: "boolean", description: "Include archived repos" },
        },
        required: ["owner", "repo"],
      };
      // Act
      render(
        <McpToolForm
          schema={schema}
          values={{}}
          onChange={vi.fn()}
        />
      );
      // Assert — two text inputs, one number input, one checkbox
      expect(screen.getAllByRole("textbox")).toHaveLength(2);
      expect(screen.getAllByRole("spinbutton")).toHaveLength(1);
      expect(screen.getAllByRole("checkbox")).toHaveLength(1);
      expect(screen.getByText(/repository owner/i)).toBeInTheDocument();
      expect(screen.getByText(/repository name/i)).toBeInTheDocument();
    });

    it("AC-2.10: reflects controlled values passed via the values prop", () => {
      // Arrange
      const schema = {
        type: "object" as const,
        properties: {
          query: { type: "string" },
          limit: { type: "number" },
        },
      };
      // Act
      render(
        <McpToolForm
          schema={schema}
          values={{ query: "hello", limit: 10 }}
          onChange={vi.fn()}
        />
      );
      // Assert
      expect(screen.getByRole("textbox")).toHaveValue("hello");
      expect(screen.getByRole("spinbutton")).toHaveValue(10);
    });
  });
});
