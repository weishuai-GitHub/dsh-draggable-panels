export function createPanelBoundary(React) {
  return class PanelBoundary extends React.Component {
    constructor(props) {
      super(props);
      this.state = { error: false };
    }
    static getDerivedStateFromError() {
      return { error: true };
    }
    render() {
      if (!this.state.error) return this.props.children;
      return (
        this.props.fallback ||
        React.createElement(
          "div",
          { role: "alert", className: "dpd-message dpd-error" },
          this.props.message,
          React.createElement(
            "button",
            { type: "button", onClick: () => this.setState({ error: false }) },
            this.props.retry,
          ),
        )
      );
    }
  };
}
