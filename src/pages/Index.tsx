import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Todayoum Landing Page
 * Displays the design system preview and welcome message
 */
const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16 animate-fade-in">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            Todayoum
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Connect your long-term life visions to short-term weekly habits.
            Plan intentionally. Live purposefully.
          </p>
          <div className="flex gap-4 justify-center pt-4">
            <Button>Get Started</Button>
            <Button variant="outline">Learn More</Button>
          </div>
        </div>
      </div>

      {/* Design System Preview */}
      <div className="container mx-auto px-4 pb-16">
        <div className="max-w-4xl mx-auto space-y-8 animate-slide-up">
          {/* Cards Section */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Life Pillars</CardTitle>
                <CardDescription>
                  Define the core areas of your life that matter most.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Health, Career, Relationships, Growth — organize your life around what truly matters.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Weekly Commitments</CardTitle>
                <CardDescription>
                  Turn visions into actionable daily habits.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Simple checklists that connect to your bigger goals and keep you on track.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Button Variants */}
          <Card>
            <CardHeader>
              <CardTitle>Button Styles</CardTitle>
              <CardDescription>
                Clean, minimal buttons with subtle interactions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <Button>Primary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="link">Link</Button>
              </div>
            </CardContent>
          </Card>

          {/* Color Palette */}
          <Card>
            <CardHeader>
              <CardTitle>Color Palette</CardTitle>
              <CardDescription>
                Olive green for emphasis, soft neutrals for calm.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <div className="h-16 rounded-lg bg-primary"></div>
                  <p className="text-xs text-muted-foreground text-center">Primary</p>
                </div>
                <div className="space-y-2">
                  <div className="h-16 rounded-lg bg-secondary border"></div>
                  <p className="text-xs text-muted-foreground text-center">Secondary</p>
                </div>
                <div className="space-y-2">
                  <div className="h-16 rounded-lg bg-muted border"></div>
                  <p className="text-xs text-muted-foreground text-center">Muted</p>
                </div>
                <div className="space-y-2">
                  <div className="h-16 rounded-lg bg-accent border"></div>
                  <p className="text-xs text-muted-foreground text-center">Accent</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Index;