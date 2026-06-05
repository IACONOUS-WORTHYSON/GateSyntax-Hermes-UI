using System;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Shapes;

namespace GateSyntax.Runtime;

public sealed class GaugeControl : FrameworkElement
{
    private double _value;
    private double _maximum = 100;
    private Brush _stroke = Brushes.DodgerBlue;
    private string _label = "";
    private readonly Grid _root;
    private readonly System.Windows.Shapes.Path _arc;
    private readonly TextBlock _valueTb;
    private readonly TextBlock _labelTb;

    public double GaugeValue
    {
        get => _value;
        set { _value = value; UpdateArc(); }
    }

    public double GaugeMaximum
    {
        get => _maximum;
        set { _maximum = value; UpdateArc(); }
    }

    public Brush GaugeStroke
    {
        get => _stroke;
        set
        {
            _stroke = value;
            _arc.Stroke = value;
            _valueTb.Foreground = value;
        }
    }

    public string GaugeLabel
    {
        get => _label;
        set { _label = value; _labelTb.Text = value; }
    }

    public GaugeControl()
    {
        Width = 160; Height = 160;

        _arc = new System.Windows.Shapes.Path
        {
            StrokeThickness = 14,
            StrokeStartLineCap = PenLineCap.Round,
            StrokeEndLineCap = PenLineCap.Round,
            Stroke = _stroke
        };

        var bg = new Ellipse
        {
            Width = 140, Height = 140,
            Stroke = new SolidColorBrush(Color.FromRgb(0xE2, 0xE8, 0xF0)),
            StrokeThickness = 14,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center
        };

        _valueTb = new TextBlock
        {
            FontSize = 32, FontWeight = FontWeights.Bold,
            Foreground = _stroke,
            HorizontalAlignment = HorizontalAlignment.Center
        };
        _labelTb = new TextBlock
        {
            FontSize = 11, Foreground = new SolidColorBrush(Color.FromRgb(0x64, 0x74, 0x8B)),
            HorizontalAlignment = HorizontalAlignment.Center
        };

        var centerStack = new StackPanel
        {
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center
        };
        centerStack.Children.Add(_valueTb);
        centerStack.Children.Add(_labelTb);

        _root = new Grid();
        _root.Children.Add(bg);
        _root.Children.Add(_arc);
        _root.Children.Add(centerStack);

        // Host the Grid as logical child
        AddLogicalChild(_root);
        AddVisualChild(_root);

        _root.Width = 160;
        _root.Height = 160;

        UpdateArc();
    }

    protected override int VisualChildrenCount => 1;
    protected override Visual GetVisualChild(int index) => _root;

    protected override Size MeasureOverride(Size availableSize)
    {
        _root.Measure(availableSize);
        return new Size(160, 160);
    }

    protected override Size ArrangeOverride(Size finalSize)
    {
        _root.Arrange(new Rect(0, 0, 160, 160));
        return finalSize;
    }

    private void UpdateArc()
    {
        _valueTb.Text = $"{Math.Round(_value):F0}";
        double max = _maximum <= 0 ? 1 : _maximum;
        double v = Math.Clamp(_value, 0, max);
        double angle = (v / max) * 359.9;
        const double radius = 70;
        const double cx = 80, cy = 80;

        double rad = (angle - 90) * Math.PI / 180.0;
        double startRad = -90 * Math.PI / 180.0;

        var start = new Point(cx + radius * Math.Cos(startRad), cy + radius * Math.Sin(startRad));
        var end = new Point(cx + radius * Math.Cos(rad), cy + radius * Math.Sin(rad));
        bool largeArc = angle > 180;

        var fig = new PathFigure { StartPoint = start, IsClosed = false, IsFilled = false };
        fig.Segments.Add(new ArcSegment
        {
            Point = end,
            Size = new Size(radius, radius),
            IsLargeArc = largeArc,
            SweepDirection = SweepDirection.Clockwise
        });
        var geom = new PathGeometry();
        geom.Figures.Add(fig);
        _arc.Data = geom;
    }
}
