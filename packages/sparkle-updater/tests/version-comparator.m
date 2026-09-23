#import <Foundation/Foundation.h>
#import <Sparkle/Sparkle.h>
int main(int argc, const char *argv[]) {
  @autoreleasepool {
    SUStandardVersionComparator *comparator = SUStandardVersionComparator.defaultComparator;
    for (int i = 1; i < argc; i++) {
      for (int j = 1; j < argc; j++) {
        NSComparisonResult expected = i < j ? NSOrderedAscending : i > j ? NSOrderedDescending : NSOrderedSame;
        NSString *a = [NSString stringWithUTF8String:argv[i]];
        NSString *b = [NSString stringWithUTF8String:argv[j]];
        if ([comparator compareVersion:a toVersion:b] != expected) { NSLog(@"比较失败：%@ / %@", a, b); return 1; }
      }
    }
    NSLog(@"官方 Sparkle 比较器通过 %d 个排序组合", (argc - 1) * (argc - 1));
  }
  return 0;
}
